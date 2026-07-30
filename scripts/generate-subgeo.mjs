// Generates on demand map layers into public/:
//   us-counties.json: county shapes per state (Albers USA space, for state zoom)
//   nyc-council.json: the 51 NYC council districts (own fitted projection),
//   rendered as a dedicated city view like the NYC districting commission map.
import { readFileSync, writeFileSync } from "node:fs";
import * as topojson from "topojson-client";
import { geoAlbersUsa, geoMercator, geoPath } from "d3-geo";

const STATE_FIPS = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
  "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
  "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
  "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
  "54":"WV","55":"WI","56":"WY",
};

const round = (d) => d.replace(/(\d+\.\d{1})\d+/g, "$1");

// Counties in the national Albers space
const topo = JSON.parse(readFileSync("node_modules/us-atlas/counties-10m.json", "utf8"));
const counties = topojson.feature(topo, topo.objects.counties).features;
const albers = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const cPath = geoPath(albers);
const byState = {};
let kept = 0;
for (const f of counties) {
  const st = STATE_FIPS[String(f.id).slice(0, 2)];
  if (!st) continue;
  const d = cPath(f);
  if (!d) continue;
  (byState[st] ??= []).push({ name: f.properties.name, d: round(d) });
  kept++;
}
writeFileSync("public/us-counties.json", JSON.stringify(byState));
console.log("counties:", kept);

// NYC council districts in their own fitted view (975x610)
const gj = JSON.parse(readFileSync(process.env.COUNCIL_SRC, "utf8"));
const merc = geoMercator().fitExtent([[10, 10], [965, 600]], gj);
const nPath = geoPath(merc);
const districts = gj.features
  .map((f) => ({
    num: Number(f.properties.CounDist),
    d: round(nPath(f) ?? ""),
    centroid: nPath.centroid(f).map((v) => Math.round(v * 10) / 10),
  }))
  .filter((f) => f.d)
  .sort((a, b) => a.num - b.num);
writeFileSync("public/nyc-council.json", JSON.stringify(districts));
console.log("council districts:", districts.length);
