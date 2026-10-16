# Busca el precio del Elf Bar Ice King 40K en tiendas online y guarda precios-mercado.json
# Lo corre GitHub Actions todos los días (ver .github/workflows/precios-mercado.yml)
import json, re, urllib.request, datetime, statistics

TIENDAS = [
    ("Cloud Imports", "https://cloudimports.com.ar/productos/elfbar-ice-king-40000-grape-ice/"),
    ("Ofertas La Plata", "https://www.ofertaslaplata.com.ar/productos/vaper-desechable-elfbar-ice-king-40-000-puffs/"),
    ("Goat Vape", "https://goatvape.com.ar/categoria-producto/elfbar/elfbar-ice-king-40k/"),
]

def bajar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "es-AR"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")

def num(txt):  # "$31.990,00" -> 31990
    t = re.sub(r"[^\d,\.]", "", txt).replace(".", "").split(",")[0]
    return int(t) if t else 0

def precio(html):
    # Tiendanube
    m = re.search(r'tiendanube:price"\s+content="([\d\.]+)"', html)
    if m: return int(float(m.group(1)))
    m = re.search(r'itemprop="price"\s+content="([\d\.]+)"', html)
    if m: return int(float(m.group(1)))
    # WooCommerce (lista de productos): el precio más repetido
    vals = [num(x) for x in re.findall(r'woocommerce-Price-currencySymbol[^<]*</span>\s*([\d\.]+,\d{2})', html)]
    vals = [v for v in vals if 5000 < v < 200000]
    if vals: return statistics.mode(vals)
    return 0

res = []
for nombre, url in TIENDAS:
    try:
        p = precio(bajar(url))
    except Exception as e:
        print(nombre, "error:", e); p = 0
    print(nombre, p)
    if p: res.append({"tienda": nombre, "url": url, "precio": p})

try:
    anterior = json.load(open("precios-mercado.json"))
except Exception:
    anterior = {}

if res:
    ps = [r["precio"] for r in res]
    data = {"actualizado": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "minimo": min(ps), "promedio": round(sum(ps) / len(ps)), "tiendas": res}
    hist = anterior.get("historial", [])
    hoy = data["actualizado"][:10]
    hist = [h for h in hist if h.get("fecha") != hoy] + [{"fecha": hoy, "minimo": data["minimo"], "promedio": data["promedio"]}]
    data["historial"] = hist[-60:]
    json.dump(data, open("precios-mercado.json", "w"), ensure_ascii=False, indent=1)
else:
    print("No se pudo leer ningún precio; se deja el archivo anterior.")
