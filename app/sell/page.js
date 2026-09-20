"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// เกณฑ์เตือนภัยสต๊อกใกล้หมด
const LOW_STOCK_THRESHOLD = 5;

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ตะกร้าสินค้า: [{ product_id, product_name, price, unit, quantity, maxStock }]
  const [cart, setCart] = useState([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const parsedQuantity = parseInt(quantity, 10) || 0;

  const grandTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  /* ---------- ส่วนของ Telegram Notification ---------- */

  // หนีอักขระพิเศษของ HTML กันข้อความพังถ้าชื่อสินค้ามี < > &
  const escapeHtml = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // ข้อความแจ้งเตือน Order ใหม่ (parse_mode: HTML จึงใช้ <b> ไม่ใช่ **)
  const buildOrderMessage = (item, newStock, timeText) =>
    [
      "🛍️ <b>มีรายการขายใหม่!</b>",
      `- สินค้า: ${escapeHtml(item.product_name)}`,
      `- จำนวน: ${item.quantity} ${escapeHtml(item.unit || "ชิ้น")}`,
      `- ราคารวม: ${(item.price * item.quantity).toFixed(2)} บาท`,
      `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ${escapeHtml(item.unit || "ชิ้น")}`,
      `- เวลา: ${timeText}`,
    ].join("\n");

  // ข้อความเตือนภัยสต๊อกใกล้หมด
  const buildLowStockMessage = (item, newStock) =>
    [
      "🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>",
      `- สินค้า: ${escapeHtml(item.product_name)}`,
      `- คงเหลือเพียง: ${newStock} ${escapeHtml(item.unit || "ชิ้น")}`,
      "⚠️ กรุณาเติมสต๊อกสินค้าด่วน!",
    ].join("\n");

  // ยิงเข้า API route ของเรา — ห่อ try/catch ไว้ทั้งก้อน
  // ถ้า Telegram ล่ม ระบบขายยังทำงานปกติ แค่ log ไว้ใน console
  const sendTelegramMessages = async (messages) => {
    if (messages.length === 0) return;
    try {
      await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    } catch (err) {
      console.error("ส่งแจ้งเตือน Telegram ไม่สำเร็จ:", err);
    }
  };

  /* ---------- จัดการตะกร้า ---------- */

  const handleAddToCart = () => {
    setErrorMsg("");
    if (!selectedProduct) {
      setErrorMsg("กรุณาเลือกสินค้า");
      return;
    }
    if (parsedQuantity <= 0) {
      setErrorMsg("กรุณากรอกจำนวนให้ถูกต้อง");
      return;
    }

    const existingItem = cart.find(
      (item) => item.product_id === selectedProduct.id
    );
    const currentInCart = existingItem ? existingItem.quantity : 0;
    const totalWanted = currentInCart + parsedQuantity;

    if (totalWanted > selectedProduct.stock) {
      setErrorMsg(
        `สินค้าคงเหลือไม่เพียงพอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`
      );
      return;
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product_id === selectedProduct.id
            ? { ...item, quantity: totalWanted }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          price: Number(selectedProduct.price),
          unit: selectedProduct.unit,
          quantity: parsedQuantity,
          maxStock: selectedProduct.stock,
        },
      ]);
    }

    setSelectedProductId("");
    setQuantity("");
  };

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
  };

  const handleChangeCartQuantity = (productId, newQty) => {
    const qty = parseInt(newQty, 10) || 0;
    setCart(
      cart.map((item) =>
        item.product_id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const resetCart = () => {
    setCart([]);
    setSelectedProductId("");
    setQuantity("");
  };

  /* ---------- ยืนยันการขาย ---------- */

  const handleConfirmSale = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (cart.length === 0) {
      setErrorMsg("กรุณาเพิ่มสินค้าลงตะกร้าก่อนยืนยันการขาย");
      return;
    }

    for (const item of cart) {
      if (item.quantity <= 0) {
        setErrorMsg(`จำนวนของ "${item.product_name}" ไม่ถูกต้อง`);
        return;
      }
      if (item.quantity > item.maxStock) {
        setErrorMsg(
          `"${item.product_name}" คงเหลือไม่เพียงพอ (คงเหลือ ${item.maxStock} ${item.unit})`
        );
        return;
      }
    }

    setSubmitting(true);
    const soldAt = new Date().toISOString();

    // 1. บันทึกทุกรายการลงตาราง sales
    const salesRows = cart.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      total_price: item.price * item.quantity,
      sold_at: soldAt,
    }));

    const { error: saleError } = await supabase.from("sales").insert(salesRows);

    if (saleError) {
      setErrorMsg(saleError.message);
      setSubmitting(false);
      return;
    }

    // 2. อัปเดต stock และเก็บข้อความแจ้งเตือนไว้ส่งทีหลัง
    const timeText = new Date().toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const telegramMessages = [];

    for (const item of cart) {
      const newStock = item.maxStock - item.quantity;

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", item.product_id);

      if (updateError) {
        setErrorMsg(
          `บันทึกการขายสำเร็จ แต่ปรับสต็อก "${item.product_name}" ไม่สำเร็จ: ${updateError.message}`
        );
        setSubmitting(false);
        return;
      }

      // ตัดสต๊อกสำเร็จแล้วค่อยเตรียมข้อความแจ้งเตือน
      telegramMessages.push(buildOrderMessage(item, newStock, timeText));

      // เตือนภัยแยกอีก 1 ข้อความ ถ้าสต๊อกหลังตัดเหลือ <= 5
      if (newStock <= LOW_STOCK_THRESHOLD) {
        telegramMessages.push(buildLowStockMessage(item, newStock));
      }
    }

    // 3. ยิงแจ้งเตือน Telegram — ไม่ให้ขวางการแจ้งผลขายสำเร็จบนเว็บ
    sendTelegramMessages(telegramMessages);

    setSuccessMsg(
      `ขายสำเร็จ ${cart.length} รายการ รวม ${grandTotal.toFixed(2)} บาท`
    );
    resetCart();
    await fetchProducts();
    setSubmitting(false);
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {/* สรุปยอดรวมทั้งหมด ตัวใหญ่ไว้บนสุด */}
      <div
        className="card"
        style={{
          textAlign: "center",
          backgroundColor: "#0070f3",
          color: "#fff",
          padding: "24px",
        }}
      >
        <div style={{ fontSize: "16px", opacity: 0.9 }}>ยอดรวมทั้งหมด</div>
        <div style={{ fontSize: "48px", fontWeight: "800", lineHeight: 1.2 }}>
          {grandTotal.toFixed(2)} บาท
        </div>
        <div style={{ fontSize: "14px", opacity: 0.9 }}>
          {cart.length} รายการสินค้า
        </div>
      </div>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: "12px" }}>{errorMsg}</p>
      )}
      {successMsg && (
        <p style={{ color: "green", marginBottom: "12px" }}>{successMsg}</p>
      )}

      {/* เพิ่มสินค้าลงตะกร้า */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>เพิ่มสินค้า</h2>
        {loading ? (
          <p>กำลังโหลดสินค้า...</p>
        ) : (
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{ flex: "1 1 220px" }}
            >
              <option value="">-- เลือกสินค้า --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} - {Number(p.price).toFixed(2)} บาท (คงเหลือ {p.stock})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="จำนวน"
              style={{ width: "100px" }}
            />
            <button type="button" onClick={handleAddToCart}>
              + เพิ่มลงตะกร้า
            </button>
          </div>
        )}
      </div>

      {/* ตะกร้าสินค้า */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>รายการที่จะขาย</h2>
        {cart.length === 0 ? (
          <p>ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ชื่อสินค้า</th>
                <th>ราคา/หน่วย</th>
                <th>จำนวน</th>
                <th>รวม</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.product_id}>
                  <td>{item.product_name}</td>
                  <td>{item.price.toFixed(2)}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max={item.maxStock}
                      value={item.quantity}
                      onChange={(e) =>
                        handleChangeCartQuantity(item.product_id, e.target.value)
                      }
                      style={{ width: "70px" }}
                    />
                  </td>
                  <td style={{ fontWeight: "700" }}>
                    {(item.price * item.quantity).toFixed(2)}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(item.product_id)}
                      style={{ backgroundColor: "#e00" }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={handleConfirmSale}
            disabled={submitting || cart.length === 0}
            style={{ fontSize: "16px", padding: "12px 24px" }}
          >
            {submitting ? "กำลังบันทึก..." : "ยืนยันการขาย"}
          </button>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={resetCart}
              disabled={submitting}
              style={{ backgroundColor: "#888" }}
            >
              ล้างตะกร้า
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
