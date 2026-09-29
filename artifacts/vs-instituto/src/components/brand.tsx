import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Instagram,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  RotateCw,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  getGetSettingsQueryKey,
  getGetStaffMeQueryKey,
  useGetSettings,
  useGetStaffMe,
  useLogout,
} from '@workspace/api-client-react';
import type { SalonSettings } from '@workspace/api-client-react';
import {
  addDays,
  monthShort,
  relativeDay,
  salonToday,
  SALON_NAME,
  weekdayOf,
  weekdayShort,
  whatsappLink,
} from '@/lib/format';

const DEFAULT_SETTINGS: SalonSettings = {
  name: SALON_NAME,
  whatsapp: '',
  address: '',
  instagram: '',
  about: '',
  salonSharePercent: 30,
};

/** Informações públicas do salão (nome, WhatsApp, endereço...). */
export function useSalon(): SalonSettings {
  const settings = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), staleTime: 5 * 60_000 } });
  return settings.data ?? DEFAULT_SETTINGS;
}

export function BrandMark({ dark = false }: { dark?: boolean }) {
  const salon = useSalon();
  return (
    <Link
      href="/"
      className={`flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dark ? 'text-[#f7f0e5]' : 'text-foreground'}`}
      data-testid="link-brand"
      aria-label={`${salon.name} — início`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/70">
        <span className="display text-2xl leading-none">V</span>
      </span>
      <span className="leading-none">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.27em]">VS Instituto</span>
        <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] text-accent">de beleza</span>
      </span>
    </Link>
  );
}

function SignOutButton({ mobile = false }: { mobile?: boolean }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const logout = useLogout();
  return (
    <button
      onClick={() =>
        logout.mutate(undefined, {
          onSettled: () => {
            qc.clear();
            navigate('/entrar');
          },
        })
      }
      className={
        mobile
          ? 'flex items-center gap-2 rounded-lg px-3 py-3 text-left hover:bg-muted'
          : 'flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground'
      }
      data-testid="button-sign-out"
    >
      <LogOut className="h-4 w-4" /> Sair
    </button>
  );
}

export function AppHeader({ staff = false }: { staff?: boolean }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const me = useGetStaffMe({ query: { queryKey: getGetStaffMeQueryKey(), enabled: staff, retry: false } });
  const isAdmin = staff && me.data?.role === 'admin';
  const isProfessional = staff && me.data?.role === 'professional';
  const linkClass = (href: string) =>
    `transition-colors hover:text-foreground ${location === href ? 'text-foreground font-semibold' : 'text-muted-foreground'}`;
  const links: { href: string; label: string; testId: string }[] = staff
    ? [
        ...(isProfessional ? [{ href: '/equipe', label: 'Minha agenda', testId: 'link-staff' }] : []),
        ...(isAdmin
          ? [
              { href: '/admin', label: 'Visão geral', testId: 'link-admin' },
              { href: '/admin/servicos', label: 'Serviços', testId: 'link-admin-services' },
              { href: '/admin/equipe', label: 'Equipe', testId: 'link-admin-team' },
              { href: '/admin/salao', label: 'Salão', testId: 'link-admin-salon' },
            ]
          : []),
        ...(me.data ? [{ href: '/conta', label: 'Minha conta', testId: 'link-account' }] : []),
      ]
    : [{ href: '/meu-agendamento', label: 'Meu agendamento', testId: 'link-my-booking' }];

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-10">
        <BrandMark />
        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)} data-testid={link.testId}>
              {link.label}
            </Link>
          ))}
          {staff && me.data && <SignOutButton />}
          {!staff && location !== '/' && (
            <Link
              href="/"
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              data-testid="link-header-book"
            >
              Agendar horário
            </Link>
          )}
        </nav>
        <button
          className="rounded-lg border border-border p-2 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          data-testid="button-open-menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-border bg-background px-5 py-3 md:hidden" aria-label="Menu">
          <div className="flex flex-col gap-1 text-sm">
            {!staff && location !== '/' && (
              <Link href="/" className="rounded-lg px-3 py-3 hover:bg-muted" onClick={() => setOpen(false)}>
                Agendar horário
              </Link>
            )}
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 hover:bg-muted"
                onClick={() => setOpen(false)}
                data-testid={`mobile-${link.testId}`}
              >
                {link.label}
              </Link>
            ))}
            {staff && me.data && <SignOutButton mobile />}
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const salon = useSalon();
  const wa = salon.whatsapp ? whatsappLink(salon.whatsapp, `Olá! Vim pelo site do ${salon.name}.`) : null;
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between lg:px-10">
        <div className="space-y-2">
          <p className="font-semibold text-foreground">{salon.name}</p>
          {salon.address && (
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address)}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground hover:underline"
              >
                {salon.address}
              </a>
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline" data-testid="link-footer-whatsapp">
                <MessageCircle className="h-3.5 w-3.5 text-emerald-700" /> WhatsApp
              </a>
            )}
            {salon.instagram && (
              <a
                href={`https://instagram.com/${salon.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline"
              >
                <Instagram className="h-3.5 w-3.5 text-accent" /> @{salon.instagram}
              </a>
            )}
          </div>
        </div>
        <div className="space-y-2 sm:text-right">
          <p className="flex items-center gap-2 sm:justify-end">
            <LockKeyhole className="h-3 w-3" /> Seus dados são usados apenas para o agendamento.
          </p>
          <Link href="/entrar" className="inline-block text-[11px] text-muted-foreground/70 hover:text-foreground" data-testid="link-staff-area">
            Área da equipe
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function LoadingBlock({ label = 'Carregando' }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-5 text-sm text-muted-foreground"
      role="status"
      data-testid="status-loading"
    >
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
      {label}
    </div>
  );
}

export function ErrorBlock({ onRetry, label = 'Não foi possível carregar agora.' }: { onRetry?: () => void; label?: string }) {
  return (
    <div
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
      role="alert"
      data-testid="status-error"
    >
      <p>{label}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold hover:bg-destructive/10"
          data-testid="button-retry"
        >
          <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
      <h2 className="display text-4xl leading-none sm:text-5xl">{title}</h2>
      {subtitle && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between text-accent">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight" data-testid={`metric-${label}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

export function AuthNotice({ title = 'Área reservada', message }: { title?: string; message?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm" data-testid="auth-notice">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <LockKeyhole className="h-5 w-5" />
      </div>
      <h2 className="display mt-5 text-4xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {message ?? 'Entre com sua conta de equipe para ver os horários e cuidar da operação do instituto.'}
      </p>
      <Link
        href="/entrar"
        className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        data-testid="link-staff-sign-in"
      >
        <LogIn className="h-4 w-4" /> Entrar
      </Link>
    </div>
  );
}

/**
 * Horizontal list of upcoming days. Days outside the professional's regular
 * weekdays are shown as closed; any other date can still be picked with the
 * native date input.
 */
export function DateStrip({
  value,
  onChange,
  weekdays,
  days = 21,
}: {
  value: string;
  onChange: (date: string) => void;
  weekdays?: number[];
  days?: number;
}) {
  const today = salonToday();
  const list = Array.from({ length: days }, (_, index) => addDays(today, index));
  const inList = list.includes(value);
  return (
    <div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]" role="listbox" aria-label="Escolha a data">
        {list.map((date) => {
          const closed = weekdays ? !weekdays.includes(weekdayOf(date)) : false;
          const selected = date === value;
          const label = relativeDay(date) ?? weekdayShort(date);
          return (
            <button
              key={date}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={closed}
              onClick={() => onChange(date)}
              className={`flex min-w-[62px] snap-start flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-colors ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : closed
                    ? 'cursor-not-allowed border-border/40 text-muted-foreground/45'
                    : 'border-border bg-background hover:border-accent'
              }`}
              data-testid={`button-date-${date}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{label}</span>
              <span className="mt-0.5 text-lg font-semibold leading-tight">{date.slice(8, 10)}</span>
              <span className={`text-[10px] uppercase ${selected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {closed ? 'fechado' : monthShort(date)}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        Outra data:
        <input
          type="date"
          min={today}
          value={value}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          className={`h-9 rounded-lg border bg-background px-2 text-xs text-foreground outline-none focus:border-accent ${inList ? 'border-input' : 'border-accent'}`}
          data-testid="input-booking-date"
        />
      </label>
    </div>
  );
}

export function DayNavigator({ date, setDate }: { date: string; setDate: (value: string) => void }) {
  const today = salonToday();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setDate(addDays(date, -1))}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-card hover:border-accent"
        aria-label="Dia anterior"
        data-testid="button-prev-day"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={date}
        onChange={(event) => event.target.value && setDate(event.target.value)}
        className="h-11 rounded-xl border border-input bg-card px-3 text-sm"
        data-testid="input-dashboard-date"
        aria-label="Data"
      />
      <button
        onClick={() => setDate(addDays(date, 1))}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-card hover:border-accent"
        aria-label="Próximo dia"
        data-testid="button-next-day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {date !== today && (
        <button
          onClick={() => setDate(today)}
          className="h-11 rounded-xl border border-input bg-card px-3 text-xs font-semibold hover:border-accent"
          data-testid="button-today"
        >
          Hoje
        </button>
      )}
    </div>
  );
}

type SlotLike = { time: string; available: boolean };

/** Available slots grouped by period of the day. */
export function SlotGrid({
  slots,
  selected,
  onSelect,
}: {
  slots: SlotLike[];
  selected?: string;
  onSelect: (time: string) => void;
}) {
  const free = slots.filter((slot) => slot.available);
  const groups = [
    { label: 'Manhã', items: free.filter((slot) => slot.time < '12:00') },
    { label: 'Tarde', items: free.filter((slot) => slot.time >= '12:00' && slot.time < '18:00') },
    { label: 'Noite', items: free.filter((slot) => slot.time >= '18:00') },
  ].filter((group) => group.items.length);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {group.items.map((slot) => (
              <button
                key={slot.time}
                type="button"
                onClick={() => onSelect(slot.time)}
                className={`min-h-11 rounded-lg border text-sm font-semibold transition-colors ${
                  selected === slot.time
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-accent hover:bg-accent/10'
                }`}
                data-testid={`button-slot-${slot.time}`}
              >
                {slot.time}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
