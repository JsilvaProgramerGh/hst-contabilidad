import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const body = await req.json();
    const email = body?.email;

    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    // ✅ IMPORTANTE: crear el cliente y usarlo (sb)
    const sb = supabaseServer(); // si tu helper fuera async: const sb = await supabaseServer();

    const { data, error } = await sb
      .from("quotes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    // Aquí luego se enviará el email real
    console.log("Enviar cotización", data, "a", email);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err }, { status: 500 });
  }
}