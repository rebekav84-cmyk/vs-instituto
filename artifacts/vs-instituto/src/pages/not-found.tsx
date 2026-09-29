import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { AppHeader } from '@/components/brand';

export default function NotFound() {
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <AppHeader />
      <main className="mx-auto flex max-w-xl flex-col items-start px-5 py-20">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent">página não encontrada</p>
        <h1 className="display mt-3 text-5xl sm:text-6xl">Esse caminho não existe.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          O endereço pode ter mudado ou foi digitado com algum erro. Você pode agendar um horário ou consultar o seu.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Agendar horário <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/meu-agendamento" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold">
            Meu agendamento
          </Link>
        </div>
      </main>
    </div>
  );
}
