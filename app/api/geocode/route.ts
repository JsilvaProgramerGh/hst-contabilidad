import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("q")?.trim();
  const lat = request.nextUrl.searchParams.get("lat")?.trim();
  const lng = request.nextUrl.searchParams.get("lng")?.trim();

  if (lat && lng) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lng);

      const response = await fetch(url.toString(), {
        headers: {
          "Accept-Language": "es",
          "User-Agent": "HST Contabilidad / Agenda Pedidos",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return NextResponse.json({ error: "No pude consultar la direccion de esas coordenadas." }, { status: 502 });
      }

      const result = (await response.json()) as {
        display_name?: string;
        address?: Record<string, string>;
      };

      return NextResponse.json({
        data: {
          label: result.display_name || "",
          address: result.address || {},
        },
      });
    } catch {
      return NextResponse.json({ error: "No pude traducir esas coordenadas a direccion." }, { status: 500 });
    }
  }

  if (!search) {
    return NextResponse.json({ error: "Falta la direccion a consultar." }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ec");
    url.searchParams.set("q", search);

    const response = await fetch(url.toString(), {
      headers: {
        "Accept-Language": "es",
        "User-Agent": "HST Contabilidad / Agenda Pedidos",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "No pude consultar el geocodificador." }, { status: 502 });
    }

    const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const first = results[0];

    if (!first) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        latitude: Number(first.lat),
        longitude: Number(first.lon),
        label: first.display_name,
      },
    });
  } catch {
    return NextResponse.json({ error: "No pude obtener coordenadas en este momento." }, { status: 500 });
  }
}
