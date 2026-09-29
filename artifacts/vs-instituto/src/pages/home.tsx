import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAvailabilityQueryKey,
  useCreateAppointment,
  useGetAvailability,
  useListProfessionals,
  useListServices,
} from '@workspace/api-client-react';
import type { Appointment, Service } from '@workspace/api-client-react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Search,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import { Link } from 'wouter';
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
  addDays,
  apiErrorMessage,
  apiErrorStatus,
  displayDate,
  downloadIcs,
  duration,
  firstName,
  formatCode,
  formatPhoneInput,
  googleCalendarUrl,
  isValidPhone,
  money,
  rememberCode,
  salonToday,
  shortDate,
  whatsappLink,
  weekdayOf,
} from '@/lib/format';

function Progress({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  const labels = ['Serviço', 'Horário', 'Dados'];
  return (
    <ol className="mb-7 flex items-center gap-2" aria-label={`Etapa ${step} de 3`} data-testid="booking-progress">
      {labels.map((label, index) => {
        const number = index + 1;
        const active = number <= step;
        const canGoBack = number < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() => onStep(number)}
              className="flex items-center gap-2 disabled:cursor-default"
              aria-current={number === step ? 'step' : undefined}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {number < step ? <Check className="h-3.5 w-3.5" /> : number}
              </span>
              <span
                className={`hidden text-[11px] uppercase tracking-[0.12em] sm:block ${active ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
            </button>
            {index < labels.length - 1 && <span className={`h-px flex-1 ${number < step ? 'bg-accent' : 'bg-border'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function BookingSuccess({ appointment, onAnother }: { appointment: Appointment; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const salon = useSalon();
  const salonName = salon.name;
  const code = formatCode(appointment.code);
  const contact = salon.whatsapp
    ? whatsappLink(salon.whatsapp, `Olá! Acabei de agendar ${appointment.service.name} para ${shortDate(appointment.date)} às ${appointment.time}. Código ${code}.`)
    : null;
  const event = {
    title: `${appointment.service.name} · ${salonName}`,
    date: appointment.date,
    time: appointment.time,
    minutes: appointment.service.durationMinutes,
    details: `Com ${appointment.professional.name}. Código da reserva: ${code}`,
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="grain min-h-[100dvh] bg-background">
      <AppHeader />
      <main className="mx-auto flex max-w-3xl px-5 py-12 lg:py-20">
        <div className="w-full animate-rise rounded-[2rem] border border-border bg-card p-7 shadow-md sm:p-12" data-testid="booking-success">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent">
            <Check className="h-8 w-8" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">Está reservado</p>
          <h1 className="display mt-3 text-5xl sm:text-6xl">Até já, {firstName(appointment.clientName)}.</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
            Seu horário está confirmado. Guarde o código abaixo: com ele você consulta, remarca ou cancela quando precisar.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Código</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-xl font-bold tracking-widest" data-testid="text-confirmation-code">
                  {code}
                </p>
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold hover:border-accent"
                  data-testid="button-copy-code"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Quando</p>
              <p className="mt-1 font-semibold">{displayDate(appointment.date)}</p>
              <p className="text-sm text-muted-foreground">às {appointment.time}</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {appointment.service.name} com {appointment.professional.name}
                <span className="block text-xs text-muted-foreground">{duration(appointment.service.durationMinutes)}</span>
              </span>
              <strong>{money(appointment.expectedAmount)}</strong>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-semibold hover:border-accent"
              data-testid="link-google-calendar"
            >
              <CalendarPlus className="h-3.5 w-3.5 text-accent" /> Google Agenda
            </a>
            <button
              onClick={() => downloadIcs(event, `vs-${appointment.code}`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-semibold hover:border-accent"
              data-testid="button-download-ics"
            >
              <CalendarPlus className="h-3.5 w-3.5 text-accent" /> Agenda do celular (.ics)
            </button>
            {contact && (
              <a
                href={contact}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-semibold hover:border-accent"
                data-testid="link-success-whatsapp"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-700" /> Falar com o salão
              </a>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/meu-agendamento/${appointment.code}`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
              data-testid="link-manage-confirmed"
            >
              Gerenciar agendamento
            </Link>
            <button
              onClick={onAnother}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold"
              data-testid="link-book-another"
            >
              Agendar outro horário
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const qc = useQueryClient();
  const salon = useSalon();
  const flowRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [date, setDate] = useState(salonToday());
  const [time, setTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [filter, setFilter] = useState('');
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);

  const services = useListServices();
  const professionals = useListProfessionals();
  const availabilityParams = { serviceId: serviceId ?? 0, professionalId: professionalId ?? 0, date };
  const availability = useGetAvailability(availabilityParams, {
    query: {
      enabled: Boolean(serviceId && professionalId && date),
      retry: false,
      queryKey: getGetAvailabilityQueryKey(availabilityParams),
    },
    request: { responseType: 'json', timeoutMs: 15000 },
  });
  const create = useCreateAppointment();

  const selectedService = services.data?.find((item) => item.id === serviceId);
  const selectedProfessional = professionals.data?.find((item) => item.id === professionalId);
  const freeSlots = availability.data?.slots.filter((slot) => slot.available) ?? [];

  const visibleServices = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (services.data ?? []).filter((service) => !term || service.name.toLowerCase().includes(term));
  }, [services.data, filter]);

  // With a single professional there is nothing to choose.
  useEffect(() => {
    if (professionals.data?.length === 1 && !professionalId) setProfessionalId(professionals.data[0].id);
  }, [professionals.data, professionalId]);

  // Keep the chosen date on a day the professional usually works.
  useEffect(() => {
    if (!selectedProfessional) return;
    let next = date;
    for (let index = 0; index < 14 && !selectedProfessional.weekdays.includes(weekdayOf(next)); index += 1) {
      next = addDays(next, 1);
    }
    if (next !== date && date === salonToday()) setDate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfessional?.id]);

  const goTo = (next: number) => {
    setStep(next);
    setNotice('');
    requestAnimationFrame(() => {
      const top = flowRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > window.innerHeight * 0.6) {
        flowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const chooseService = (service: Service) => {
    setServiceId(service.id);
    setTime('');
    goTo(2);
  };

  const nextOpenDay = () => {
    let next = addDays(date, 1);
    const weekdays = selectedProfessional?.weekdays;
    for (let index = 0; weekdays && index < 14 && !weekdays.includes(weekdayOf(next)); index += 1) next = addDays(next, 1);
    setDate(next);
    setTime('');
  };

  const nameOk = clientName.trim().length >= 2;
  const phoneOk = isValidPhone(whatsapp);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!serviceId || !professionalId || !time || !nameOk || !phoneOk) return;
    create.mutate(
      { data: { serviceId, professionalId, date, time, clientName: clientName.trim(), whatsapp } },
      {
        onSuccess: (appointment) => {
          rememberCode(appointment.code);
          setConfirmed(appointment);
          qc.invalidateQueries({ queryKey: getGetAvailabilityQueryKey(availabilityParams) });
        },
        onError: (error) => {
          if (apiErrorStatus(error) === 409) {
            qc.invalidateQueries({ queryKey: getGetAvailabilityQueryKey(availabilityParams) });
            setTime('');
            goTo(2);
            setNotice(apiErrorMessage(error, 'Esse horário acabou de ser reservado. Escolha outro.'));
          }
        },
      },
    );
  };

  const reset = () => {
    setConfirmed(null);
    setStep(1);
    setServiceId(null);
    setTime('');
    create.reset();
  };

  if (confirmed) return <BookingSuccess appointment={confirmed} onAnother={reset} />;

  const inputClass =
    'mt-2 h-12 w-full rounded-xl border bg-background px-4 text-base font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-accent sm:text-sm';

  return (
    <div className="grain min-h-[100dvh] bg-background">
      <AppHeader />
      <main className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 lg:px-10 lg:py-16">
        <section className="animate-rise lg:pt-6">
          <p className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-accent">
            <Sparkles className="h-3 w-3" /> beleza no seu tempo
          </p>
          <h1 className="display max-w-2xl text-[3.2rem] leading-[.88] sm:text-[5.5rem] lg:text-[6.6rem]">
            Seu momento,
            <br />
            <em className="text-accent">bem cuidado.</em>
          </h1>
          <p className="mt-6 max-w-md whitespace-pre-line text-base leading-7 text-muted-foreground">
            {salon.about ||
              'Escolha seu serviço, encontre um horário tranquilo e deixe o resto com a gente. Agendar leva menos de um minuto.'}
          </p>
          <ul className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              { icon: <CalendarCheck className="h-4 w-4" />, title: 'Confirmação na hora', text: 'Seu horário fica reservado assim que você confirma.' },
              { icon: <KeyRound className="h-4 w-4" />, title: 'Tudo pelo código', text: 'Consulte, remarque ou cancele sem ligar.' },
              { icon: <UserRoundCheck className="h-4 w-4" />, title: 'Sem cadastro', text: 'Só seu nome e WhatsApp.' },
            ].map((item) => (
              <li key={item.title} className="hidden rounded-2xl border border-border/70 bg-card/60 p-4 sm:block">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">{item.icon}</span>
                <p className="mt-3 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/meu-agendamento"
            className="mt-8 hidden items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline lg:inline-flex"
          >
            Já tem um horário? Consulte pelo código <ArrowRight className="h-4 w-4 text-accent" />
          </Link>
        </section>

        <section
          ref={flowRef}
          className="animate-rise animate-rise-delay-1 min-w-0 scroll-mt-24 self-start rounded-[1.7rem] border border-border bg-card p-5 shadow-md sm:p-8 lg:sticky lg:top-24"
          data-testid="booking-flow"
          aria-label="Agendamento"
        >
          <Progress step={step} onStep={goTo} />

          {step === 1 && (
            <div>
              <SectionTitle eyebrow="01 · comece por aqui" title="O que vamos fazer?" subtitle="Valores transparentes e tempo reservado só para você." />
              {(services.data?.length ?? 0) > 6 && (
                <label className="relative mb-4 block">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <span className="sr-only">Buscar serviço</span>
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Buscar serviço"
                    className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-base outline-none focus:border-accent sm:text-sm"
                    data-testid="input-service-filter"
                  />
                </label>
              )}
              {services.isLoading && <LoadingBlock label="Buscando nossos serviços" />}
              {services.isError && <ErrorBlock onRetry={() => services.refetch()} />}
              {services.isSuccess && services.data.length === 0 && (
                <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nenhum serviço disponível para agendamento no momento.</p>
              )}
              <div className="max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
                {visibleServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => chooseService(service)}
                    className={`group flex min-h-[70px] w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm ${
                      service.id === serviceId ? 'border-accent bg-accent/10' : 'border-border'
                    }`}
                    data-testid={`button-service-${service.id}`}
                  >
                    <span>
                      <span className="block font-semibold">{service.name}</span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {duration(service.durationMinutes)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <strong className="text-sm">{money(service.price)}</strong>
                      <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                ))}
                {services.isSuccess && services.data.length > 0 && visibleServices.length === 0 && (
                  <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nenhum serviço encontrado com “{filter}”.</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <button onClick={() => goTo(1)} className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="button-back-service">
                <ArrowLeft className="h-4 w-4" /> Voltar para serviços
              </button>
              <SectionTitle eyebrow="02 · escolha seu momento" title="Quando fica melhor?" />
              {selectedService && (
                <div className="mb-6 flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{selectedService.name}</span>
                    <span className="text-muted-foreground"> · {duration(selectedService.durationMinutes)}</span>
                  </span>
                  <strong>{money(selectedService.price)}</strong>
                </div>
              )}
              {notice && (
                <p className="mb-5 rounded-xl border border-accent/50 bg-accent/10 p-3 text-sm" role="alert" data-testid="status-slot-taken">
                  {notice}
                </p>
              )}

              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sua profissional</p>
              {professionals.isLoading && <LoadingBlock label="Buscando a equipe" />}
              {professionals.isError && <ErrorBlock onRetry={() => professionals.refetch()} />}
              {professionals.isSuccess && professionals.data.length === 0 && (
                <p className="mb-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nenhuma profissional disponível para agendamento no momento.</p>
              )}
              <div className="mb-7 grid grid-cols-2 gap-3">
                {professionals.data?.map((professional) => (
                  <button
                    key={professional.id}
                    onClick={() => {
                      setProfessionalId(professional.id);
                      setTime('');
                    }}
                    aria-pressed={professionalId === professional.id}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      professionalId === professional.id ? 'border-accent bg-accent/10' : 'border-border hover:border-accent'
                    }`}
                    data-testid={`button-professional-${professional.id}`}
                  >
                    <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {professional.initials}
                    </span>
                    <span className="block text-sm font-semibold">{professional.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">a partir das {professional.startsAt}</span>
                  </button>
                ))}
              </div>

              {professionalId ? (
                <>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data</p>
                  <DateStrip
                    value={date}
                    onChange={(value) => {
                      setDate(value);
                      setTime('');
                    }}
                    weekdays={selectedProfessional?.weekdays}
                  />
                  <div className="mt-6">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Horários livres</span>
                      <span className="text-xs text-muted-foreground">{displayDate(date)}</span>
                    </div>
                    {availability.isFetching ? (
                      <LoadingBlock label="Buscando horários disponíveis" />
                    ) : availability.isError ? (
                      <ErrorBlock
                        label={apiErrorMessage(availability.error, 'Não foi possível consultar os horários. Tente novamente.')}
                        onRetry={() => availability.refetch()}
                      />
                    ) : availability.isSuccess && freeSlots.length ? (
                      <SlotGrid
                        slots={availability.data.slots}
                        selected={time}
                        onSelect={(value) => {
                          setTime(value);
                          goTo(3);
                        }}
                      />
                    ) : availability.isSuccess ? (
                      <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground" data-testid="empty-slots">
                        <p>
                          {!availability.data.slots.length
                            ? 'Não há atendimento nesta data.'
                            : availability.data.slots.every((slot) => slot.reason === 'Horário já passou')
                              ? 'Os horários de hoje já passaram.'
                              : 'Todos os horários deste dia já foram preenchidos.'}
                        </p>
                        <button
                          onClick={nextOpenDay}
                          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                          data-testid="button-next-open-day"
                        >
                          Ver o próximo dia <ArrowRight className="h-4 w-4 text-accent" />
                        </button>
                      </div>
                    ) : (
                      <LoadingBlock label="Preparando horários" />
                    )}
                  </div>
                </>
              ) : (
                professionals.isSuccess && (
                  <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Escolha uma profissional para ver os horários.</p>
                )
              )}
            </div>
          )}

          {step === 3 && (
            <form onSubmit={submit} noValidate>
              <button type="button" onClick={() => goTo(2)} className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="button-back-time">
                <ArrowLeft className="h-4 w-4" /> Voltar para horários
              </button>
              <SectionTitle eyebrow="03 · quase lá" title="Como podemos te chamar?" subtitle="Usamos seu WhatsApp apenas para falar sobre este atendimento." />
              <div className="space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Seu nome
                  <input
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Nome e sobrenome"
                    autoComplete="name"
                    maxLength={80}
                    aria-invalid={touched && !nameOk}
                    className={`${inputClass} ${touched && !nameOk ? 'border-destructive' : 'border-input'}`}
                    data-testid="input-client-name"
                  />
                  {touched && !nameOk && <span className="mt-1.5 block text-[11px] normal-case tracking-normal text-destructive">Informe seu nome.</span>}
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  WhatsApp
                  <input
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(formatPhoneInput(event.target.value))}
                    placeholder="(27) 99999-9999"
                    inputMode="tel"
                    autoComplete="tel-national"
                    aria-invalid={touched && !phoneOk}
                    className={`${inputClass} ${touched && !phoneOk ? 'border-destructive' : 'border-input'}`}
                    data-testid="input-client-whatsapp"
                  />
                  {touched && !phoneOk && (
                    <span className="mt-1.5 block text-[11px] normal-case tracking-normal text-destructive">Informe o número com DDD.</span>
                  )}
                </label>
              </div>
              <div className="mt-6 rounded-xl bg-muted p-4">
                <div className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p className="font-semibold">{selectedService?.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {displayDate(date)} · {time}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      com {selectedProfessional?.name} · {selectedService && duration(selectedService.durationMinutes)}
                    </p>
                  </div>
                  <strong data-testid="text-final-price">{money(selectedService?.price)}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => goTo(2)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" /> Alterar data ou horário
                </button>
              </div>
              <button
                type="submit"
                disabled={create.isPending}
                className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                data-testid="button-confirm-booking"
              >
                {create.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar agendamento
              </button>
              {create.isError && apiErrorStatus(create.error) !== 409 && (
                <p className="mt-3 text-center text-xs text-destructive" role="alert" data-testid="status-booking-error">
                  {apiErrorMessage(create.error, 'Não conseguimos reservar este horário. Tente novamente.')}
                </p>
              )}
              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                Ao confirmar, você recebe um código para remarcar ou cancelar pelo site.
              </p>
            </form>
          )}
        </section>

        <Link
          href="/meu-agendamento"
          className="flex items-center justify-between rounded-2xl border border-border bg-card/70 p-4 text-sm font-semibold lg:hidden"
        >
          Já tem um horário? Consulte pelo código <ArrowRight className="h-4 w-4 text-accent" />
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
