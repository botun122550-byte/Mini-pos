"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function HistoryPage() {
  // รายการประวัติการขายทั้งหมด
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // โหลดข้อมูลการขายจาก Supabase เรียงจากล่าสุดไปเก่าสุด
  const fetchSales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("sold_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSales(data);
      setErrorMsg("");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // คำนวณยอดขายรวมทั้งหมด (sum ของ total_price)
  const totalRevenue = sales.reduce(
    (sum, sale) => sum + Number(sale.total_price || 0),
    0
  );

  // แปลงวันเวลาให้อ่านง่าย (แบบไทย)
  const formatDateTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      <h1>ประวัติการขาย</h1>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: "12px" }}>{errorMsg}</p>
      )}

      {/* ยอดขายรวมทั้งหมด */}
      <div
        className="card"
        style={{
          fontWeight: "700",
          fontSize: "18px",
          backgroundColor: "#0070f3",
          color: "#fff",
        }}
      >
        ยอดขายรวมทั้งหมด: {totalRevenue.toFixed(2)} บาท
      </div>

      {/* ตารางประวัติการขาย */}
      <div className="card">
        {loading ? (
          <p>กำลังโหลดข้อมูล...</p>
        ) : sales.length === 0 ? (
          <p>ยังไม่มีประวัติการขาย</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>วันเวลาที่ขาย</th>
                <th>ชื่อสินค้า</th>
                <th>จำนวน</th>
                <th>ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{formatDateTime(sale.sold_at)}</td>
                  <td>{sale.product_name}</td>
                  <td>{sale.quantity}</td>
                  <td>{Number(sale.total_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
