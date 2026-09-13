"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SellPage() {
  // รายการสินค้าทั้งหมด (สำหรับ dropdown)
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ค่าที่ผู้ใช้เลือก/กรอก
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // โหลดสินค้าทั้งหมดจาก Supabase
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

  // หาสินค้าที่ถูกเลือกอยู่ตอนนี้ เพื่อใช้คำนวณยอดรวม
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const parsedQuantity = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct
    ? Number(selectedProduct.price) * parsedQuantity
    : 0;

  // เคลียร์ฟอร์มหลังขายสำเร็จ
  const resetForm = () => {
    setSelectedProductId("");
    setQuantity("");
  };

  const handleSell = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!selectedProduct) {
      setErrorMsg("กรุณาเลือกสินค้า");
      return;
    }
    if (parsedQuantity <= 0) {
      setErrorMsg("กรุณากรอกจำนวนให้ถูกต้อง");
      return;
    }

    // ตรวจสอบ stock คงเหลือ ก่อนบันทึกการขาย
    if (parsedQuantity > selectedProduct.stock) {
      setErrorMsg(
        `สินค้าคงเหลือไม่เพียงพอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`
      );
      return;
    }

    setSubmitting(true);

    // 1. บันทึกรายการลงตาราง sales
    const { error: saleError } = await supabase.from("sales").insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: parsedQuantity,
        total_price: totalPrice,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      setErrorMsg(saleError.message);
      setSubmitting(false);
      return;
    }

    // 2. อัปเดต stock ในตาราง products ให้ลดลงตามจำนวนที่ขาย
    const newStock = selectedProduct.stock - parsedQuantity;
    const { error: updateError } = await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", selectedProduct.id);

    if (updateError) {
      setErrorMsg(updateError.message);
      setSubmitting(false);
      return;
    }

    // สำเร็จ: แจ้งเตือน เคลียร์ฟอร์ม และโหลดสินค้าใหม่ (stock อัปเดต)
    setSuccessMsg(
      `ขาย ${selectedProduct.name} จำนวน ${parsedQuantity} ${selectedProduct.unit} สำเร็จ`
    );
    resetForm();
    await fetchProducts();
    setSubmitting(false);
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: "12px" }}>{errorMsg}</p>
      )}
      {successMsg && (
        <p style={{ color: "green", marginBottom: "12px" }}>{successMsg}</p>
      )}

      <div className="card" style={{ maxWidth: "420px" }}>
        {loading ? (
          <p>กำลังโหลดสินค้า...</p>
        ) : (
          <form
            onSubmit={handleSell}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {/* Dropdown เลือกสินค้า */}
            <div>
              <label style={{ display: "block", marginBottom: "4px" }}>
                เลือกสินค้า
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {Number(p.price).toFixed(2)} บาท (คงเหลือ {p.stock})
                  </option>
                ))}
              </select>
            </div>

            {/* ช่องกรอกจำนวน */}
            <div>
              <label style={{ display: "block", marginBottom: "4px" }}>
                จำนวน
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ width: "100%" }}
                placeholder="จำนวนที่จะขาย"
              />
            </div>

            {/* แสดงยอดรวมอัตโนมัติ */}
            <div
              style={{
                backgroundColor: "#f5f6f8",
                padding: "10px",
                borderRadius: "6px",
                fontWeight: "600",
              }}
            >
              ยอดรวม: {totalPrice.toFixed(2)} บาท
            </div>

            <button type="submit" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ขาย"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
