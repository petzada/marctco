export default function DashboardLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Carregando dashboard"
      className="mx-auto grid max-w-content-wide gap-lg p-md sm:p-lg"
    >
      <header>
        <div className="h-8 w-48 rounded-md bg-surface-inset" />
        <div className="mt-xs h-6 w-full max-w-prose rounded-md bg-surface-inset" />
      </header>
      <section className="grid grid-cols-1 gap-lg md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-40 rounded-lg border border-hairline bg-surface-inset" key={index} />
        ))}
      </section>
    </main>
  );
}
