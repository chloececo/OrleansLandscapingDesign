// Conversational-design proxy (issue #37).
// Turns a gardener's plain-language request into the same constraints object the
// app's constrainedPalette() consumes — using Claude with a structured-output
// schema so the reply is always valid JSON and plant ids are enum-locked to the
// real catalog (the model literally cannot name a plant we don't have).
//
// The API key and the shared password live ONLY here, in Netlify env vars — never
// in the browser. Set both in Netlify → Site settings → Environment variables:
//   ANTHROPIC_API_KEY   your Claude API key
//   APP_PASSWORD        a shared secret the page sends in the x-app-password header
//
// Quick test once deployed (or via `netlify dev`):
//   curl -s https://YOURSITE/.netlify/functions/design \
//     -H 'content-type: application/json' -H 'x-app-password: YOURPASS' \
//     -d '{"prompt":"no hydrangeas, under 2 ft, more pollinators","bedLight":"sun"}'

const MODEL = 'claude-opus-5';

// Real catalog ids — the enum boundary. Regenerate from Object.keys(PLANTS) if the
// catalog changes (see scratchpad harness / plantIndex in index.html).
const PIDS = ["anisegoldenrod","arborvitae","astilbe","baptisia","basil","bayberry","beachplum","bearberry","beardtongue","blazingstar","blueflagiris","bluetviolet","boxwood","butterflybush","butterflymilkweed","cardinalflower","catnip","chives","chokeberry","christmasfern","cinnamonfern","coneflower","daylily","dill","fern","foamflower","fountaingrass","goldenalexanders","goldengroundsel","heuchera","highbushblueberry","holly","hosta","hydrangea","inkberry","lavender","lilac","liriope","littlebluestem","mint","mountainmint","newenglandaster","newjerseytea","oak","oakleafhydrangea","orangedaylily","oregano","ostrichfern","oxeyesunflower","parsley","pennsylvaniasedge","peony","prairiedropseed","purplelovegrass","reedgrass","rhododendron","rosemary","rudbeckia","sage","salvia","seasidegoldenrod","sedum","shadbush","spirea","swampmilkweed","sweetfern","sweetpepperbush","switchgrass","teaberry","thyme","thymeground","trumpethoneysuckle","viburnum","vinca","virginiacreeper","whitewoodaster","wildbergamot","wildcolumbine","wildgeranium","wildlupine","wildstrawberry","winterberry","woodlandphlox"];
const CATS = ["Fern","Grass","Groundcover","Herb","Perennial","Shrub","Tree","Vine"];
const STYLE_KEYS = ["meadow","coastal","shrub","woodland","cottage","foliage"];

// Structured-output schema. Every field is required so the model returns a complete
// object; scalars are nullable, arrays default to []. Shapes match the app's
// constraints contract exactly, so the reply drops straight into mergeConstraints().
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['exclude','excludeCat','require','boost','nativeOnly','maxHeightFt','light','color','lowMaintenance','style','unsupported'],
  properties: {
    exclude:      { type: 'array', items: { type: 'string', enum: PIDS } },
    require:      { type: 'array', items: { type: 'string', enum: PIDS } },
    excludeCat:   { type: 'array', items: { type: 'string', enum: CATS } },
    boost:        { type: 'array', items: { type: 'string', enum: ['pollinator'] } },
    nativeOnly:   { anyOf: [ { type: 'boolean' }, { type: 'null' } ] },
    maxHeightFt:  { anyOf: [ { type: 'number' }, { type: 'null' } ] },
    light:        { anyOf: [ { type: 'string', enum: ['sun','part sun','shade'] }, { type: 'null' } ] },
    color:        { anyOf: [ { type: 'string', enum: ['blue','purple','pink','red','orange','yellow','white'] }, { type: 'null' } ] },
    lowMaintenance:{ anyOf: [ { type: 'boolean' }, { type: 'null' } ] },
    style:        { anyOf: [ { type: 'string', enum: STYLE_KEYS }, { type: 'null' } ] },
    unsupported:  { type: 'string' },
  },
};

const SYSTEM = `You translate a gardener's plain-language request about ONE planting bed into a structured set of constraints for a native-plant design tool. Return ONLY the structured object.

Field meaning:
- exclude / require: plant ids to drop / force-keep. Ids are lowercased plant names (e.g. "coneflower", "swampmilkweed", "oakleafhydrangea"). A generic word like "hydrangeas" or "asters" means EVERY matching id. Only ever use ids from the allowed list; if the user names a plant that isn't in the list, do NOT guess a substitute — mention it in "unsupported" instead.
- excludeCat: whole categories to drop ("fewer grasses" -> ["Grass"]).
- boost: ["pollinator"] when they want more pollinator support / bees / butterflies / more bloom.
- nativeOnly: true if they ask for natives; false only if they explicitly want non-natives; otherwise null (the tool is native-first by default).
- maxHeightFt: a height cap in feet ("under 2 ft" -> 2, "knee-high" -> ~2, "18 inches" -> 1.5), else null.
- light: 'sun' | 'part sun' | 'shade' if they call for a light level, else null.
- color: a single flower colour if they ask for one, else null. "more colour"/"colourful" is NOT a colour — leave color null and set style:"cottage".
- lowMaintenance: true for "low-maintenance / easy / tough / drought-tolerant", else null.
- style: one of ${STYLE_KEYS.join(', ')} if they evoke that feel (meadow, seaside/coastal, shrub-anchored, woodland, cottage/cutting/romantic/colourful, foliage/texture), else null.
- unsupported: a short friendly sentence for ANY part of the request the tool can't do — it only chooses which plants go in the bed. It CANNOT change the bed's shape or size, add hardscape (paths, water, benches, fences, lighting), place plants at specific spots (left/right/"in the corner"), or add plants that aren't in the catalog. Leave "" if everything was expressible.

Be conservative: only set fields the user actually asked for. Leave arrays empty and scalars null otherwise.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'POST only' };
  if ((event.headers['x-app-password'] || event.headers['X-App-Password']) !== process.env.APP_PASSWORD)
    return { statusCode: 401, body: 'unauthorized' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'bad json' }; }
  const prompt = (body.prompt || '').toString().slice(0, 2000).trim();
  if (!prompt) return { statusCode: 400, body: 'empty prompt' };
  const bedLight = ['sun','part sun','shade'].includes(body.bedLight) ? body.bedLight : null;
  const userText = bedLight ? `Bed light: ${bedLight}.\nRequest: ${prompt}` : `Request: ${prompt}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: userText }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'claude', status: r.status, detail: detail.slice(0, 500) }) };
    }
    const data = await r.json();
    if (data.stop_reason === 'refusal')
      return { statusCode: 200, headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ unsupported: "Sorry — I can't help with that request." }) };
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    // output_config.format guarantees the first text block is schema-valid JSON.
    const constraints = JSON.parse(text);
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(constraints) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'proxy', detail: String(e).slice(0, 300) }) };
  }
};
