-- Aangan Studio phone enquiry agent: call log + state
-- Safe to run more than once.

create table if not exists calls (
  id               bigserial primary key,
  call_id          text unique not null,
  caller_phone     text,
  caller_name      text,
  started_at       timestamptz not null default now(),
  duration_sec     integer not null default 0,
  after_hours      boolean not null default false,
  returning_caller boolean not null default false,
  transcript       text,
  classification   text,            -- qualified | not_fit | incomplete | existing_client | other
  reason           text,
  summary          text,
  criteria         jsonb,           -- { real_project: {status, evidence}, ... }
  project          jsonb,           -- handoff fields extracted by Gemini
  flags            jsonb,           -- notes for the designer (unclear budget / decision-maker etc.)
  pricing_asked    boolean not null default false,
  price_quoted     boolean not null default false,   -- compliance: agent said a number
  booking          jsonb,
  hubspot_deal_id  text,
  handoff_sent     boolean not null default false,
  escalation_sent  boolean not null default false,
  converted        boolean not null default false,
  cost_voice_inr   numeric(10,2) not null default 0,
  cost_ai_inr      numeric(10,4) not null default 0,
  ai_tokens_in     integer,
  ai_tokens_out    integer,
  ai_model         text,
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists calls_started_idx on calls (started_at desc);
create index if not exists calls_phone_idx on calls (caller_phone);

-- Existing clients (Nikhil / front desk add these) so complaints are recognised.
create table if not exists clients (
  phone      text primary key,       -- last 10 digits
  name       text,
  project    text,
  designer   text,
  notes      text,
  created_at timestamptz not null default now()
);

-- Audit trail: bookings made during the call, handoffs, escalations, errors.
create table if not exists events (
  id           bigserial primary key,
  call_id      text,
  caller_phone text,
  type         text not null,       -- booking | handoff | escalation | hubspot | error | tool
  detail       jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists events_call_idx on events (call_id);
create index if not exists events_phone_idx on events (caller_phone, created_at desc);
