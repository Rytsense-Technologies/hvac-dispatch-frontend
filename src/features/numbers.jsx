// Phone number: the company's own number. Admins only. Two ways, each switched on separately on the server:
//  * get a new number through the platform's Twilio account (search, pick, confirm: it has a monthly fee; releasing it stops the fee);
//  * connect the number the company already has, at ANY provider, over a SIP trunk (features/sipTrunks.jsx).
// The server decides everything (limits, countries, who may buy); this screen only asks and shows what it says.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  Badge, Spinner, Empty, ErrorBox, Note, PageHeader, DataTable, Field, Select, Overlay, ActionButton, Button, toast, useRun, Card, Icon,
} from '../components/index.js';
import { SipCard } from './sipTrunks.jsx';

const KIND_LABEL = { local: 'Local', mobile: 'Mobile', toll_free: 'Toll-free' };

function ConfirmDialog({ title, text, label, tone, action, onClose }) {
  return (
    <Overlay title={title} onClose={onClose}>
      <div className="stack">
        <p>{text}</p>
        <div className="right">
          <ActionButton className={`btn ${tone === 'bad' ? 'btn--danger' : 'btn--primary'}`} action={async () => { await action(); onClose(); }}>{label}</ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

function SearchCard({ state, reload }) {
  const [f, setF] = useState({ country: state.countries[0], kind: 'local', area: '' });
  const [found, setFound] = useState(null);
  const [busy, run] = useRun();
  const [pick, setPick] = useState(null);
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  // The types on offer depend on the country (Twilio sells no mobile numbers in the US).
  const kinds = state.kinds?.[f.country] || ['local'];
  const changeCountry = (e) => setF({ ...f, country: e.target.value, kind: (state.kinds?.[e.target.value] || ['local'])[0] });

  const search = (event) => {
    event.preventDefault();
    run(async () => {
      setFound({ status: 'loading' });
      try {
        const { numbers } = await api('/v1/numbers/available', { params: { country: f.country, kind: f.kind, area_code: f.area.trim() } });
        setFound({ status: 'ready', list: numbers });
      } catch (error) {
        setFound({ status: 'error', error });
      }
    });
  };

  const buy = (number) => async () => {
    await api('/v1/numbers', { method: 'POST', body: { phone_number: number.phone_number, country: f.country, confirm: true } });
    toast(`${number.phone_number} is now your company's number.`);
    reload();
  };

  let results = null;
  if (found?.status === 'loading') results = <Spinner />;
  else if (found?.status === 'error') results = <ErrorBox error={found.error} />;
  else if (found?.status === 'ready') {
    results = found.list.length ? (
      <DataTable label="Numbers you can get" head={['Number', 'Place', '']} rows={found.list.map((n) => [
        <strong className="mono">{n.phone_number}</strong>,
        [n.locality, n.region].filter(Boolean).join(', ') || '-',
        <Button className="btn btn--outline btn--small" onClick={() => setPick(n)}>Get this number</Button>,
      ])} />
    ) : <Empty text="No numbers found. Try another area code or type." />;
  }

  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="phone" /><span>Get a phone number</span></span></Card.Title>
      <form className="stack" noValidate onSubmit={search}>
        <div className="grid2">
          <Field label="Country"><Select options={state.countries.map((c) => [c, c])} value={f.country} onChange={changeCountry} /></Field>
          <Field label="Type"><Select options={kinds.map((k) => [k, KIND_LABEL[k] || k])} {...bind('kind')} /></Field>
          <Field label="Area code" hint="Optional"><input type="text" inputMode="numeric" maxLength={6} placeholder="e.g. 803" {...bind('area')} /></Field>
        </div>
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Search numbers</button></div>
      </form>
      {results}
      {pick ? (
        <ConfirmDialog title="Get this number" label="Get this number" tone="good" onClose={() => setPick(null)} action={buy(pick)}
          text={`${pick.phone_number} will be your company's phone number, for calls and texts. It has a monthly fee that is charged by the platform. You can release it later.`} />
      ) : null}
    </Card>
  );
}

export default function Numbers() {
  const [state, setState] = useState({ status: 'loading' });
  const [releasing, setReleasing] = useState(null);
  const seq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    try {
      const [data, sip] = await Promise.all([api('/v1/numbers'), api('/v1/sip-trunks')]);
      if (mine === seq.current) setState({ status: 'ready', data, sip });
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  const release = (number) => async () => {
    await api(`/v1/numbers/${encodeURIComponent(number.phone_number)}`, { method: 'DELETE' });
    toast('Number released.');
    load();
  };

  let body;
  const data = state.data;
  const sip = state.sip;
  if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (!data) body = <Spinner />;
  else if (!(data.enabled && data.ready) && !(sip?.enabled && sip?.ready)) body = <Note text={data.note || sip?.note || 'Company phone numbers are not available yet.'} />;
  else {
    body = (
      <>
        {data.enabled && data.ready ? (
        <>
        <Card as="section">
          <Card.Title><span className="row"><Icon name="phone" /><span>Your phone number</span></span></Card.Title>
          {data.numbers.length ? (
            <DataTable label="Your phone numbers" head={['Number', 'Country', 'Status', '']} rows={data.numbers.map((n) => [
              <strong className="mono">{n.phone_number}</strong>,
              n.country,
              <Badge text={n.status === 'active' ? 'Active' : 'Setting up'} tone={n.status === 'active' ? 'good' : 'warn'} />,
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setReleasing(n)}>Release</button>,
            ])} />
          ) : <Note text="Your company has no phone number of its own yet. Until it does, calls and texts use the shared number." />}
        </Card>
        {data.can_buy ? <SearchCard state={data} reload={load} /> : (
          <p className="muted">{`A company can have ${data.max_numbers} phone number${data.max_numbers === 1 ? '' : 's'}. Release one to get a different one.`}</p>
        )}
        </>
        ) : null}
        {sip?.enabled && sip?.ready ? <SipCard sip={sip} reload={load} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Phone number" subtitle="Your company's own number for customer calls and texts." />
      {body}
      {releasing ? (
        <ConfirmDialog title="Release this number" label="Release" tone="bad" onClose={() => setReleasing(null)} action={release(releasing)}
          text={`${releasing.phone_number} will stop ringing and texting your company, and the monthly fee ends. You may not be able to get the same number again.`} />
      ) : null}
    </>
  );
}
