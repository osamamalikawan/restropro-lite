import { NextResponse } from "next/server";
import { resolveRestaurantByCredentials } from "@/lib/auth/resolve-owner";

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const result = await resolveRestaurantByCredentials(email, password);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ slug: result.restaurant.slug, name: result.restaurant.name });
  } catch (err) {
    console.error("Restaurant login error:", err);
    return NextResponse.json({ error: "Something went wrong while signing in." }, { status: 500 });
  }
}