import { connection } from "next/server";
import "./globals.css";
import { tenant, tenantPublico } from "../lib/tenant";
import { TenantProvider } from "../components/TenantProvider";

// El cliente (TENANT) se lee en cada solicitud y no al compilar: la misma imagen
// sirve a EDIMCA o a la Cooperativa 23 de Julio según su variable de entorno.
export async function generateMetadata() {
  await connection();
  return { title: `Sistema de Encuestas — ${tenant().nombre}` };
}

export default async function RootLayout({ children }) {
  await connection();
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <TenantProvider value={tenantPublico()}>{children}</TenantProvider>
      </body>
    </html>
  );
}
