import { serve } from "https://deno.land/std@0.142.0/http/server.ts";
import type { Row } from "./types.d.ts";
import client from "./client.ts";
import headers from "./cors.ts";

const url =
  "https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json";
const res = await fetch(url);
const rows: Row[] = await res.json();

const regions: Record<string, number> = {};
const provinces: Record<string, number> = {};

// function sanitize(str: string) {
//   return str.replace(/[^a-zA-Z0-9]/g, "");
// }

async function truncate() {
  await client.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  await client.execute("TRUNCATE TABLE cities");
  await client.execute("TRUNCATE TABLE provinces");
  await client.execute("TRUNCATE TABLE regions");
  await client.execute(`SET FOREIGN_KEY_CHECKS = 1`);
}

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  const t0 = performance.now();

  await truncate();

  for await (const row of rows) {
    const [regionName] = row.regione.nome.split("/");
    if (!regions[regionName]) {
      const res1 = await client.execute(
        "INSERT IGNORE INTO regions(name) value(?)",
        [regionName],
      );
      if (res1.lastInsertId) {
        regions[regionName] = res1.lastInsertId;
      }
    }

    const [provinceName] = row.provincia.nome.split("/");
    if (!provinces[provinceName]) {
      const res1 = await client.execute(
        "INSERT IGNORE INTO provinces(name, sigla, region_id) value(?, ?, ?)",
        [
          provinceName,
          row.sigla,
          regions[row.regione.nome],
        ],
      );
      if (res1.lastInsertId) {
        provinces[provinceName] = res1.lastInsertId;
      }
    }

    for (const cap of row.cap) {
      await client.execute(
        "INSERT INTO cities(name, cap, cc, province_id) value(?, ?, ?, ?)",
        [
          row.nome,
          cap,
          row.codiceCatastale,
          provinces[provinceName],
        ],
      );
    }
  }

  await client.close();

  const t1 = performance.now();

  return new Response(
    JSON.stringify({ time: t1 - t0 }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
});
