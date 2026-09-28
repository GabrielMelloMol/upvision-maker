/** Placeholder enquanto o chunk da página carrega ou os dados chegam do banco. */
export default function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Carregando">
      <span className="skeleton" style={{ width: 260, height: 32, marginBottom: 14 }} />
      <span className="skeleton line" style={{ width: "46%", marginBottom: 32 }} />
      <div className="tool-layout">
        <span className="skeleton" style={{ height: 320, borderRadius: 16 }} />
        <span className="skeleton" style={{ height: 420, borderRadius: 22 }} />
      </div>
    </div>
  );
}
