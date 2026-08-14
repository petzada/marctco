export default function TeamLoading() {
  return (
    <main aria-busy="true" aria-label="Carregando equipe" className="mx-auto grid max-w-content-wide gap-lg p-md sm:p-lg">
      <header>
        <div className="h-8 w-32 rounded-md bg-surface-inset" />
        <div className="mt-xs h-6 w-full max-w-prose rounded-md bg-surface-inset" />
      </header>
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <div className="h-7 w-48 rounded-md bg-surface-inset" />
        <div className="mt-lg grid gap-md md:grid-cols-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div className={`h-16 rounded-md bg-surface-inset ${index === 4 ? "md:col-span-2" : ""}`} key={index} />
          ))}
        </div>
      </section>
      <div className="h-64 rounded-lg border border-hairline bg-surface-inset max-[480px]:hidden" />
      <div className="grid gap-sm min-[481px]:hidden">
        <div className="h-40 rounded-lg border border-hairline bg-surface-inset" />
        <div className="h-40 rounded-lg border border-hairline bg-surface-inset" />
      </div>
    </main>
  );
}
