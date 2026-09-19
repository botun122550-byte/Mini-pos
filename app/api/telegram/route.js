// Server-side route: token อยู่ฝั่ง server เท่านั้น ไม่หลุดไปที่ browser
export async function POST(request) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  // ถ้ายังไม่ได้ตั้งค่า env ให้ตอบกลับเฉยๆ ไม่ throw error เพื่อไม่ให้กระทบระบบขาย
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return Response.json(
      { ok: false, error: "ยังไม่ได้ตั้งค่า Telegram environment variables" },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    // ส่งทีละข้อความตามลำดับ (order alert ก่อน แล้วค่อย low stock alert)
    for (const text of messages) {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text,
          parse_mode: "HTML",
        }),
      });
    }

    return Response.json({ ok: true, sent: messages.length });
  } catch (err) {
    // ไม่ให้ error ของ Telegram ทำให้ฝั่งเรียกใช้พัง
    return Response.json({ ok: false, error: err.message }, { status: 200 });
  }
}
