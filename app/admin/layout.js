import AdminNav from "../../components/AdminNav";

export default function AdminLayout({ children }) {
  return (
    <div className="admin-shell">
      <AdminNav />
      <main className="admin-main">{children}</main>
    </div>
  );
}
