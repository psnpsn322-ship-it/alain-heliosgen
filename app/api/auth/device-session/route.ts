import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9-]{20,100}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { deviceId?: unknown };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    if (!DEVICE_ID_PATTERN.test(deviceId)) {
      return NextResponse.json({ error: "Invalid device identifier." }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Supabase server configuration is missing." }, { status: 503 });
    }

    const deviceHash = createHmac("sha256", serviceRoleKey)
      .update(`heliosgen-device:${deviceId}`)
      .digest("hex");
    const email = `device-${deviceHash.slice(0, 40)}@heliosgen.local`;

    // generateLink creates the user when needed and returns a one-time token
    // without sending an email. The browser exchanges it directly for a normal
    // Supabase session, so all existing JWT and RLS checks keep working.
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          helios_device_session: true,
        },
      },
    });

    if (error || !data.properties?.hashed_token) {
      console.error("[device-session] unable to generate session link", error?.message);
      return NextResponse.json({ error: "Unable to create the HeliosGen session." }, { status: 502 });
    }

    return NextResponse.json(
      { tokenHash: data.properties.hashed_token },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[device-session] unexpected error", error);
    return NextResponse.json({ error: "Unable to create the HeliosGen session." }, { status: 500 });
  }
}
