import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAppointmentQueryKey,
  getGetAvailabilityQueryKey,
  useCancelAppointment,
  useGetAppointment,
  useGetAvailability,
  useRescheduleAppointment,
} from '@workspace/api-client-react';
import type { Appointment } from '@workspace/api-client-react';
import { ArrowRight, CalendarDays, CalendarPlus, Check, LoaderCircle, MessageCircle, Search, X } from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import {
  AppHeader,
  DateStrip,
  ErrorBlock,
  LoadingBlock,
  SectionTitle,
  SiteFooter,
  SlotGrid,
  useSalon,
} from '@/components/brand';
import {
  apiErrorMessage,
  apiErrorStatus,
  displayDate,
  duration,
  firstName,
  formatCode,
  googleCalendarUrl,
  lastCode,
  money,
  rememberCode,
  salonToday,
  whatsappLink,
} from '@/lib/format';

const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const statusLabels: Record<string, string> = {
  scheduled: 'Confirmado',
  arrived: 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

function isPast(appointment: Appointment) {
  const now = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const today = salonToday();
  return appointment.date < today || (appointment.date === today && appointment.time <= now);
}

function Reschedule({ appointment, onDone }: { appointment: Appointment; onDone: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(appointment.date >= salonToday() ? appointment.date : salonToday());
  const [time, setTime] = useState('');
  const params = { serviceId: appointment.service.id, professionalId: appointment.professional.id, date };
  const availability = useGetAvailability(params, {
    query: { queryKey: getGetAvailabilityQueryKey(params), retry: false },
    request: { responseType: 'json', timeoutMs: 15000 },
  });
  const reschedule = useRescheduleAppointment();
  // The current booking still occupies its own time, so hide it from the list.
  const slots = (availability.data?.slots ?? []).map((slot) =>
    date === appointment.date && slot.time === appointment.time ? { ...slot, available: false } : slot,
  );
  const hasFree = slots.some((slot) => slot.available);
  const confirm = () => {
    if (!time) return;
    reschedule.mutate(
      { code: appointment.code, data: { professionalId: appointment.professional.id, date, time } },
      {
        onSuccess: (updated) => {
          qc.setQueryData(getGetAppointmentQueryKey(appointment.code), updated);
          onDone();
        },
        onError: () => {
          setTime('');
          availability.refetch();
        },
      },
    );
  };
  return (
    <div className="border-t border-border bg-muted/40 p-6" data-testid="panel-reschedule">
      <p className="text-sm font-semibold">Escolha um novo momento com {appointment.professional.name}</p>
      <div className="mt-4">
        <DateStrip
          value={date}
          onChange={(value) => {
            setDate(value);
            setTime('');
          }}
          weekdays={appointment.professional.weekdays}
          days={14}
        />
      </div>
      <div className="mt-5">
        {availability.isFetching ? (
          <LoadingBlock label="Buscando horários" />
        ) : availability.isError ? (
          <ErrorBlock label="Não foi possível consultar os horários." onRetry={() => availability.refetch()} />
        ) : hasFree ? (
          <SlotGrid slots={slots} selected={time} onSelect={setTime} />
        ) : (
          <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">Sem horários livres nesta data. Tente outro dia.</p>
        )}
      </div>
      {reschedule.isError && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {apiErrorMessage(reschedule.error, 'Não foi possível remarcar. Tente outro horário.')}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={confirm}
          disabled={!time || reschedule.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
          data-testid="button-confirm-reschedule"
        >
          {reschedule.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {time ? `Remarcar para ${displayDate(date).split(',')[0]} às ${time}` : 'Escolha um horário'}
        </button>
        <button onClick={onDone} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          Manter como está
        </button>
      </div>
    </div>
  );
}

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useCancelAppointment();
  const salon = useSalon();
  const salonName = salon.name;
  const contact = salon.whatsapp
    ? whatsappLink(salon.whatsapp, `Olá! Sobre meu agendamento ${formatCode(appointment.code)} (${appointment.service.name}).`)
    : null;
  const past = isPast(appointment);
  const manageable = appointment.status === 'scheduled' && !past;
  const cancelled = appointment.status === 'cancelled';
  const title = cancelled
    ? 'Agendamento cancelado.'
    : appointment.status === 'completed'
      ? `Obrigada pela visita, ${firstName(appointment.clientName)}.`
      : `${firstName(appointment.clientName)}, está tudo certo.`;
  const doCancel = () =>
    cancel.mutate(
      { code: appointment.code },
      {
        onSuccess: (updated) => {
          qc.setQueryData(getGetAppointmentQueryKey(appointment.code), updated);
          setConfirmCancel(false);
        },
      },
    );

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" data-testid="card-appointment">
      <div className={`flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-end sm:justify-between ${cancelled ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}>
        <div>
          <p className={`text-[10px] uppercase tracking-[0.2em] ${cancelled ? 'text-muted-foreground' : 'text-accent'}`}>Código {formatCode(appointment.code)}</p>
          <h3 className="display mt-2 text-4xl">{title}</h3>
        </div>
        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${cancelled ? 'bg-card text-muted-foreground' : 'bg-accent/20 text-accent'}`}
          data-testid="status-appointment"
        >
          {statusLabels[appointment.status] ?? appointment.status}
        </span>
      </div>
      <div className={`grid gap-5 p-6 sm:grid-cols-2 ${cancelled ? 'opacity-60' : ''}`}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Seu horário</p>
          <p className="mt-2 text-lg font-semibold">{displayDate(appointment.date)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            às {appointment.time} · com {appointment.professional.name}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Serviço</p>
          <p className="mt-2 text-lg font-semibold">{appointment.service.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {duration(appointment.service.durationMinutes)} · {money(appointment.expectedAmount)}
          </p>
        </div>
      </div>
      {manageable && !editing && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border p-6">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent"
            data-testid="button-reschedule"
          >
            <CalendarDays className="h-4 w-4 text-accent" /> Remarcar
          </button>
          <a
            href={googleCalendarUrl({
              title: `${appointment.service.name} · ${salonName}`,
              date: appointment.date,
              time: appointment.time,
              minutes: appointment.service.durationMinutes,
              details: `Com ${appointment.professional.name}. Código: ${formatCode(appointment.code)}`,
            })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-accent"
          >
            <CalendarPlus className="h-4 w-4 text-accent" /> Salvar na agenda
          </a>
          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/5"
              data-testid="button-cancel-booking"
            >
              <X className="h-4 w-4" /> Cancelar horário
            </button>
          ) : (
            <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alertdialog">
              <span className="flex-1">Cancelar este horário? O horário ficará livre para outra cliente.</span>
              <button
                onClick={doCancel}
                disabled={cancel.isPending}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                data-testid="button-confirm-cancel"
              >
                {cancel.isPending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />} Sim, cancelar
              </button>
              <button onClick={() => setConfirmCancel(false)} className="text-xs font-semibold text-muted-foreground">
                Voltar
              </button>
            </div>
          )}
          {cancel.isError && (
            <p className="w-full text-sm text-destructive" role="alert">
              {apiErrorMessage(cancel.error, 'Não foi possível cancelar agora. Tente novamente.')}
            </p>
          )}
        </div>
      )}
      {manageable && editing && <Reschedule appointment={appointment} onDone={() => setEditing(false)} />}
      {!manageable && !cancelled && appointment.status === 'scheduled' && (
        <p className="border-t border-border p-6 text-sm text-muted-foreground">Este horário já passou. Para qualquer ajuste, fale com o instituto.</p>
      )}
      {contact && (
        <div className="border-t border-border px-6 py-4">
          <a href={contact} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold hover:underline" data-testid="link-lookup-whatsapp">
            <MessageCircle className="h-4 w-4 text-emerald-700" /> Falar com o salão pelo WhatsApp
          </a>
        </div>
      )}
      {cancelled && (
        <div className="border-t border-border p-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-accent" data-testid="link-book-again">
            Agendar um novo horário <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </article>
  );
}

export default function BookingLookup() {
  const params = useParams<{ code?: string }>();
  const [, navigate] = useLocation();
  const [code, setCode] = useState(() => formatCode(params.code ?? lastCode()));
  const [submitted, setSubmitted] = useState(() => normalize(params.code ?? ''));

  useEffect(() => {
    if (params.code) {
      setCode(formatCode(params.code));
      setSubmitted(normalize(params.code));
    }
  }, [params.code]);

  const appointment = useGetAppointment(submitted, {
    query: { enabled: submitted.length >= 6, queryKey: getGetAppointmentQueryKey(submitted), retry: false },
  });

  useEffect(() => {
    if (appointment.data) rememberCode(appointment.data.code);
  }, [appointment.data]);

  const submitLookup = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalize(code);
    if (clean.length < 6) return;
    setSubmitted(clean);
    navigate(`/meu-agendamento/${clean}`, { replace: true });
  };

  const status = apiErrorStatus(appointment.error);

  return (
    <div className="grain min-h-[100dvh] bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 lg:py-20">
        <SectionTitle eyebrow="acesso rápido" title="Meu agendamento" subtitle="Digite o código que você recebeu ao agendar para consultar, remarcar ou cancelar." />
        <form onSubmit={submitLookup} className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Código do agendamento</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Ex.: VS-4K8P2M"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-13 w-full rounded-xl border border-input bg-card px-4 font-mono text-base uppercase tracking-widest outline-none focus:border-accent"
              data-testid="input-booking-code"
            />
          </label>
          <button
            disabled={normalize(code).length < 6}
            className="flex h-13 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            data-testid="button-find-booking"
          >
            <Search className="h-4 w-4" /> Consultar
          </button>
        </form>
        <div className="mt-8">
          {submitted && appointment.isLoading && <LoadingBlock label="Buscando seu agendamento" />}
          {submitted && appointment.isError && (
            <ErrorBlock
              label={
                status === 404
                  ? 'Não encontramos esse código. Confira os caracteres e tente novamente.'
                  : apiErrorMessage(appointment.error, 'Não foi possível consultar agora. Tente novamente.')
              }
              onRetry={status === 404 ? undefined : () => appointment.refetch()}
            />
          )}
          {appointment.data && <AppointmentCard key={appointment.data.code} appointment={appointment.data} />}
        </div>
        <div className="mt-12 rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ainda não tem um horário?</p>
          <Link href="/" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent" data-testid="link-start-booking">
            Agendar agora <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
