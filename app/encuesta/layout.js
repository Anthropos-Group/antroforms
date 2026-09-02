import EncuestaNav from "../../components/EncuestaNav";

export default function EncuestaLayout({ children }) {
  return (
    <div>
      <EncuestaNav />
      {children}
    </div>
  );
}
