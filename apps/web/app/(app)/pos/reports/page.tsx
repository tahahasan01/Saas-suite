"use client";

import { useCan } from "@/lib/can";
import { ReportView, type ReportDef } from "@/components/reports/ReportView";

const SALES: ReportDef[] = [
  { id: "day", label: "Sales by day", path: "/reports/sales?by=day", cols: [
    { key: "date", header: "Date" }, { key: "sales_count", header: "Sales" },
    { key: "gross_minor", header: "Gross", money: true }, { key: "discount_minor", header: "Discounts", money: true },
    { key: "tax_minor", header: "Sales tax", money: true }, { key: "net_minor", header: "Net sales", money: true },
    { key: "refunds_minor", header: "Refunded", money: true }, { key: "after_refunds_minor", header: "After refunds", money: true }] },
  { id: "item", label: "By item", path: "/reports/sales?by=item", cols: [
    { key: "name", header: "Item" }, { key: "qty", header: "Qty" }, { key: "net_minor", header: "Net sales", money: true },
    { key: "returned_qty", header: "Returned" }, { key: "refunds_minor", header: "Refunded", money: true }] },
  { id: "cashier", label: "By cashier", path: "/reports/sales?by=cashier", cols: [
    { key: "cashier", header: "Cashier" }, { key: "sales_count", header: "Sales" },
    { key: "net_minor", header: "Net sales", money: true }, { key: "discount_minor", header: "Discounts", money: true }] },
  { id: "method", label: "By payment method", path: "/reports/sales?by=method", cols: [
    { key: "method", header: "Method" }, { key: "sales_count", header: "Sales" },
    { key: "amount_minor", header: "Taken", money: true }, { key: "refunds_minor", header: "Refunded", money: true }] },
  { id: "tax", label: "Tax summary", path: "/reports/tax", cols: [
    { key: "source", header: "Source" }, { key: "tax_rate", header: "Rate (%)" },
    { key: "taxable_minor", header: "Taxable value", money: true }, { key: "tax_minor", header: "Sales tax", money: true },
    { key: "refund_tax_minor", header: "Tax refunded", money: true }] },
];

const STOCK: ReportDef = {
  id: "stock", label: "Stock value", path: "/reports/stock-valuation", noRange: true, cols: [
    { key: "name", header: "Product" }, { key: "sku", header: "SKU" }, { key: "category", header: "Category" },
    { key: "stock_qty", header: "In stock" }, { key: "cost_minor", header: "Unit cost", money: true },
    { key: "value_minor", header: "Value", money: true }],
};

export default function PosReportsPage() {
  const can = useCan();
  // Stock value shows cost, which only cost-holders see (field-guarded).
  const reports = can("products.cost.read") ? [...SALES, STOCK] : SALES;
  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">Sales, stock and tax for any range, ready to download as CSV.</p>
      <ReportView reports={reports} />
    </>
  );
}
