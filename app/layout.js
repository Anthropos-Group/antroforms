import "./globals.css";

export const metadata = {
  title: "Sistema de Encuestas — EDIMCA",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
