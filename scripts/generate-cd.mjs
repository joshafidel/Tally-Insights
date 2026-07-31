// Generates public/us-cd.json: 118th Congress congressional district shapes
// per state, in the national Albers space, from the census cartographic
// boundary file cb_2023_us_cd118_500k. Geometry is simplified through a
// topology so shared district borders stay coincident.
//   Usage: CD_SHP=path/to/cb_2023_us_cd118_500k.shp node scripts/generate-cd.mjs
import { writeFileSync } from "node:fs";
import * as shapefile from "shapefile";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";
import * as topojsonClient from "topojson-client";
import { geoAlbersUsa, geoPath } from "d3-geo";

const STATE_FIPS = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
  "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
  "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
  "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
  "54":"WV","55":"WI","56":"WY",
};

const round = (d, n = 1) => d.replace(new RegExp("(\\d+\\.\\d{" + n + "})\\d+", "g"), "$1");

const src = process.env.CD_SHP;
if (!src) throw new Error("set CD_SHP to the cb_2023_us_cd118_500k.shp path");

const collection = await shapefile.read(src);
const features = collection.features.filter((f) => {
  const st = STATE_FIPS[f.properties.STATEFP];
  const cd = f.properties.CD118FP;
  return st && cd && cd !== "ZZ";
});

// Simplify via a shared topology so neighboring districts keep their
// common borders after point reduction.
const topo = topology({ cds: { type: "FeatureCollection", features } }, 1e5);
const pre = presimplify(topo);
const simplified = simplify(pre, quantile(pre, 0.35));
const simple = topojsonClient.feature(simplified, simplified.objects.cds).features;

const albers = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const path = geoPath(albers);

const byState = {};
let kept = 0;
for (const f of simple) {
  const st = STATE_FIPS[f.properties.STATEFP];
  const num = String(parseInt(f.properties.CD118FP, 10) || 0);
  const d = path(f);
  if (!d) continue;
  (byState[st] ??= []).push({ num, d: round(d) });
  kept++;
}
for (const st of Object.keys(byState)) {
  byState[st].sort((a, b) => Number(a.num) - Number(b.num));
}
writeFileSync("public/us-cd.json", JSON.stringify(byState));
const size = JSON.stringify(byState).length;
console.log("districts:", kept, "states:", Object.keys(byState).length, "bytes:", size);
