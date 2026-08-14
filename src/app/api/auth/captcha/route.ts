import { NextResponse } from "next/server";
import { createCaptchaSvg, createCaptchaText, createCaptchaToken } from "@/lib/captcha";

export async function GET() {
  const answer = createCaptchaText();
  const token = await createCaptchaToken(answer);
  const response = new NextResponse(createCaptchaSvg(answer), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
  response.cookies.set("prototype_captcha", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
  });
  return response;
}
