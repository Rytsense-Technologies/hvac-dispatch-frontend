// Phone numbers tab under Calls (shell owns Call history | Phone numbers tabs).
// Reference chrome: 2-up option panels + Your numbers list + Dialog wizards.
// Live purchase/release when the workspace is eligible; sample wizards remain for preview when not.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  Badge, Spinner, ErrorBox, Note, PageHeader, Field, Select, Button, Dialog, ActionButton, toast, useRun, Panel, PanelHead, Row,
} from '../components/index.js';
import { ConnectDialog, SettingsDialog, SipCard } from './sipTrunks.jsx';

const KIND_LABEL = { local: 'Local', mobile: 'Mobile', toll_free: 'Toll-free' };

function formatUs(digits) {
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function parseUsDigits(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  return digits;
}

function ConfirmDialog({ title, text, label, tone, action, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="stack">
        <p>{text}</p>
        <div className="dialog-actions">
          <ActionButton className={`btn ${tone === 'bad' ? 'btn--danger' : 'btn--primary'} action`} action={async () => { await action(); onClose(); }}>{label}</ActionButton>
          <Button className="btn agent-btn" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Attach a number that already exists in our own phone account (the platform owner allowed it). Nothing is bought. */
function AttachNumberDialog({ options, onClose, onDone }) {
  const [phone, setPhone] = useState(options[0] || '');
  const [country, setCountry] = useState('US');
  const [busy, run] = useRun();
  const submit = () => run(async () => {
    await api('/v1/numbers/attach', { method: 'POST', body: { phone_number: phone, country } });
    toast('Number attached to your company.');
    onClose();
    onDone();
  });
  return (
    <Dialog title="Use a number we already have" onClose={onClose}>
      <div className="stack">
        <Note tone="info" text="Nothing is bought. Calls and texts to this number will open in your company. Its voice and text settings at the phone provider are not changed." />
        <Field label="Number"><Select options={options.map((n) => [n, n])} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Country (two letters)"><input type="text" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></Field>
        <div className="dialog-actions">
          <button type="button" className="btn btn--primary action" disabled={busy || !phone || country.length !== 2} onClick={submit}>Attach number</button>
          <Button className="btn agent-btn" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Live provider search + purchase when the workspace can buy numbers. No card UI — confirm-only. */
function LiveFindNumberWizard({ state, onClose, onPurchased }) {
  const [f, setF] = useState({ country: state.countries?.[0] || 'US', kind: 'local', area: '' });
  const [found, setFound] = useState(null);
  const [busy, run] = useRun();
  const [pick, setPick] = useState(null);
  const kinds = state.kinds?.[f.country] || ['local'];
  const changeCountry = (e) => setF({ ...f, country: e.target.value, kind: (state.kinds?.[e.target.value] || ['local'])[0] });
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });

  const search = (event) => {
    event.preventDefault();
    run(async () => {
      setFound({ status: 'loading' });
      try {
        const { numbers } = await api('/v1/numbers/available', { params: { country: f.country, kind: f.kind, area_code: f.area.trim() } });
        setFound({ status: 'ready', list: numbers || [] });
      } catch (error) {
        setFound({ status: 'error', error });
      }
    });
  };

  const buy = (number) => async () => {
    await api('/v1/numbers', { method: 'POST', body: { phone_number: number.phone_number, country: f.country, confirm: true } });
    toast(`${number.phone_number} is now your company's number.`);
    onPurchased();
    onClose();
  };

  if (pick) {
    return (
      <ConfirmDialog
        title="Get this number"
        label="Get this number"
        tone="good"
        onClose={() => setPick(null)}
        action={buy(pick)}
        text={`${pick.phone_number} will be your company's phone number, for calls and texts. It has a monthly fee that is charged by the platform. You can release it later. No payment card is collected here.`}
      />
    );
  }

  let results = null;
  if (found?.status === 'loading') results = <Spinner />;
  else if (found?.status === 'error') results = <ErrorBox error={found.error} />;
  else if (found?.status === 'ready') {
    results = found.list.length ? (
      <div>
        {found.list.map((n) => (
          <Row
            key={n.phone_number}
            title={n.phone_number}
            subtitle={[n.locality, n.region].filter(Boolean).join(', ') || 'Available'}
            trailing={<Button className="btn agent-btn" onClick={() => setPick(n)}>Get this number</Button>}
          />
        ))}
      </div>
    ) : <Emptyish text="No numbers found. Try another area code or type." />;
  }

  return (
    <Dialog title="Find a new number" wide onClose={onClose}>
      <p>Search available numbers by country, type, and area code. Confirm to provision — no payment card is collected in this console.</p>
      <form className="stack" noValidate onSubmit={search}>
        <div className="grid2">
          <Field label="Country"><Select options={(state.countries || ['US']).map((c) => [c, c])} value={f.country} onChange={changeCountry} /></Field>
          <Field label="Type"><Select options={kinds.map((k) => [k, KIND_LABEL[k] || k])} {...bind('kind')} /></Field>
          <Field label="Area code" hint="Optional"><input type="text" inputMode="numeric" maxLength={6} placeholder="e.g. 803" {...bind('area')} /></Field>
        </div>
        <div className="dialog-actions">
          <button type="submit" className="btn btn--primary action" disabled={busy}>Search numbers</button>
        </div>
      </form>
      {results}
    </Dialog>
  );
}

function Emptyish({ text }) {
  return <p className="sub">{text}</p>;
}

/** Illustrative sample wizard when live purchase is not available. */
function SampleFindNumberWizard({ onClose, onAdd }) {
  const [step, setStep] = useState({ kind: 'search' });
  const [area, setArea] = useState('');
  const [error, setError] = useState('');

  if (step.kind === 'search') {
    return (
      <Dialog title="Find a new number" onClose={onClose}>
        <p>
          Enter a US area code to view <strong>illustrative examples</strong>. Number availability, capabilities, and prices must be confirmed with your phone provider.
        </p>
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[2-9]\d{2}$/.test(area.trim())) {
              setError('Enter a valid three-digit area code.');
              return;
            }
            setError('');
            setStep({ kind: 'results', area: area.trim() });
          }}
        >
          <Field label="US area code">
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder="e.g. 512"
              value={area}
              onChange={(e) => setArea(e.target.value.replace(/\D/g, '').slice(0, 3))}
              required
            />
          </Field>
          {error ? <p role="alert" className="note note--bad">{error}</p> : null}
          <button type="submit" className="btn btn--primary action">Show sample numbers</button>
        </form>
        <p className="sample-label">Sample numbers use the reserved 555-01xx range and cannot receive calls.</p>
      </Dialog>
    );
  }

  if (step.kind === 'results') {
    const examples = ['0101', '0102', '0103'].map((n) => `+1 (${step.area}) 555-${n}`);
    return (
      <Dialog title="Choose a sample number" onClose={onClose}>
        <p>
          Illustrative results for area code <strong>{step.area}</strong>. These examples are not available to purchase.
        </p>
        <div>
          {examples.map((n) => (
            <Row
              key={n}
              title={n}
              subtitle="Voice and text capability: to be confirmed"
              trailing={(
                <Button className="btn agent-btn" aria-label={`Choose sample number ${n}`} onClick={() => setStep({ kind: 'checkout', number: n })}>
                  Choose
                </Button>
              )}
            />
          ))}
        </div>
        <button type="button" className="btn btn--link link" onClick={() => setStep({ kind: 'search' })}>Change area code</button>
      </Dialog>
    );
  }

  return (
    <Dialog title="Review number selection" onClose={onClose}>
      <p>
        <strong>{step.number}</strong>
        <br />
        New US local number · Sample selection
      </p>
      <div className="agent-banner">
        <strong>Before a real purchase</strong>
        <br />
        The provider must confirm availability, voice or messaging support, recurring number fees, usage charges, taxes, and any applicable setup requirements.
      </div>
      <p>No payment details are collected. Selecting the button below adds a sample setup to this concept.</p>
      <div className="dialog-actions">
        <Button
          className="btn btn--primary action"
          onClick={() => {
            onAdd({
              number: step.number,
              method: 'New number',
              description: 'Provider availability and costs not verified',
              status: 'Sample selection',
              kind: 'new',
            });
            onClose();
            toast('Sample selection added. No purchase was made.');
          }}
        >
          Add sample selection
        </Button>
        <Button className="btn agent-btn" onClick={() => setStep({ kind: 'search' })}>Back</Button>
      </div>
    </Dialog>
  );
}

function ExistingNumberWizard({ onClose, onAdd, onProviderConnect }) {
  const [step, setStep] = useState({ kind: 'methods' });
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');

  if (step.kind === 'methods') {
    return (
      <Dialog title="Connect your existing number" wide onClose={onClose}>
        <p>Choose a connection method. Your existing carrier and provider determine the steps and availability.</p>
        <div className="phone-choice">
          <h3>Forward calls</h3>
          <p>Keep your current carrier and forward calls to an AI destination number. Your carrier controls forwarding settings and charges.</p>
          <Button className="btn btn--primary action" onClick={() => setStep({ kind: 'form', method: 'Forward calls' })}>Set up forwarding</Button>
        </div>
        <div className="phone-choice">
          <h3>Transfer the number</h3>
          <p>Move the number to a supported provider through a porting process. Eligibility, authorization, and timing must be confirmed before any transfer.</p>
          <Button className="btn agent-btn" onClick={() => setStep({ kind: 'form', method: 'Transfer number' })}>Explore number transfer</Button>
        </div>
        <div className="phone-choice">
          <h3>Use a supported provider</h3>
          <p>Connect a number already held with an integrated provider, where supported.</p>
          <Button
            className="btn agent-btn"
            onClick={() => {
              onClose();
              onProviderConnect?.();
            }}
          >
            Explore provider connection
          </Button>
        </div>
        <p className="sample-label">No carrier changes occur in this concept.</p>
      </Dialog>
    );
  }

  if (step.kind === 'form') {
    const help = step.method === 'Forward calls'
      ? 'A destination number and carrier-specific forwarding instructions will be needed.'
      : step.method === 'Transfer number'
        ? 'Confirm the current carrier, service address, account ownership, and provider requirements before requesting a transfer.'
        : 'A supported provider account and authorization are required before a number can be linked.';
    return (
      <Dialog title={step.method} onClose={onClose}>
        <p>{help}</p>
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const digits = parseUsDigits(number);
            if (!/^[2-9]\d{9}$/.test(digits)) {
              setError('Enter a 10-digit US number, optionally with +1.');
              return;
            }
            setError('');
            setStep({ kind: 'review', method: step.method, number: formatUs(digits) });
          }}
        >
          <Field label="Existing US business phone number">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(512) 555-0100"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
          </Field>
          <p className="sample-label">Use a sample number for this demo. No verification message is sent.</p>
          {error ? <p role="alert" className="note note--bad">{error}</p> : null}
          <div className="dialog-actions">
            <button type="submit" className="btn btn--primary action">Review setup</button>
            <Button className="btn agent-btn" onClick={() => setStep({ kind: 'methods' })}>Change method</Button>
          </div>
        </form>
      </Dialog>
    );
  }

  const steps = step.method === 'Forward calls'
    ? ['Confirm your business number.', 'Get an AI destination number from a supported provider.', 'Configure forwarding with your current carrier.', 'Place a test call and verify the routing.']
    : step.method === 'Transfer number'
      ? ['Check eligibility with the receiving provider.', 'Review required carrier and ownership information.', 'Authorize the transfer with the receiving provider.', 'Track the transfer and test calls after completion.']
      : ['Choose a supported provider and authorize the connection.', 'Verify access to the existing number.', 'Configure call routing and place a test call.'];

  return (
    <Dialog title="Review connection plan" onClose={onClose}>
      <p>
        <strong>{step.number}</strong>
        <br />
        {step.method}
      </p>
      <ol className="phone-steps">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <p className="sample-label">These are illustrative steps. No verification, port request, forwarding change, or provider authorization is performed.</p>
      <div className="dialog-actions">
        <Button
          className="btn btn--primary action"
          onClick={() => {
            onAdd({
              number: step.number,
              method: step.method,
              description: 'Setup steps require provider and carrier action',
              status: 'Setup not started',
              kind: 'existing',
            });
            onClose();
            toast('Sample connection plan saved for this session.');
          }}
        >
          Save sample plan
        </Button>
        <Button className="btn agent-btn" onClick={() => setStep({ kind: 'form', method: step.method })}>Edit</Button>
      </div>
    </Dialog>
  );
}

function NumberDetailDialog({ entry, onClose, onRestart }) {
  return (
    <Dialog title="Phone number setup" onClose={onClose}>
      <p>
        <strong>{entry.number}</strong>
        <br />
        {entry.method} · {entry.status}
      </p>
      <div className="agent-banner">
        {entry.kind === 'new'
          ? 'Provider search, availability, pricing, and payment are not connected.'
          : 'This number is not verified or connected. Complete the required steps with the relevant provider and carrier before using it.'}
      </div>
      <Button className="btn agent-btn" onClick={onRestart}>
        {entry.kind === 'new' ? 'Find another sample number' : 'Review connection steps'}
      </Button>
    </Dialog>
  );
}

export default function Numbers() {
  const [apiState, setApiState] = useState({ status: 'loading' });
  const [sessionNumbers, setSessionNumbers] = useState([]);
  const [wizard, setWizard] = useState(null);
  const [releasing, setReleasing] = useState(null);
  const seq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setApiState((s) => ({ status: 'loading', data: s.data, sip: s.sip }));
    try {
      const [data, sip] = await Promise.all([api('/v1/numbers'), api('/v1/sip-trunks')]);
      if (mine === seq.current) setApiState({ status: 'ready', data, sip });
    } catch (error) {
      if (mine === seq.current) setApiState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  const addSession = (entry) => setSessionNumbers((list) => [...list, entry]);

  const release = (number) => async () => {
    await api(`/v1/numbers/${encodeURIComponent(number.phone_number)}`, { method: 'DELETE' });
    toast('Number released.');
    load();
  };

  const data = apiState.data;
  const sip = apiState.sip;
  const liveNumbers = data?.numbers || [];
  const numbersLive = !!(data?.enabled && data?.ready);
  const canBuyLive = !!(numbersLive && data?.can_buy);
  const attachable = numbersLive ? (data?.attachable || []) : [];
  // Match pre-design: show SIP management whenever the server says SIP is ready (even with zero trunks).
  const showSipCard = !!(sip?.enabled && sip?.ready);
  const neitherReady = apiState.status === 'ready' && !numbersLive && !showSipCard;

  const openFind = () => setWizard(canBuyLive ? 'find-live' : 'find-sample');

  let foot;
  if (canBuyLive || showSipCard) {
    foot = canBuyLive
      ? 'Live number search and SIP use your provider account. Sample flows never charge a card.'
      : 'SIP connect is live for this workspace. Platform number purchase is not available yet.';
  } else {
    foot = 'Design concept · No real numbers are searched, purchased, transferred, verified, or connected.';
  }

  return (
    <div className="calls-page numbers-page">
      <PageHeader
        eyebrow="Call setup"
        title="Phone numbers"
        subtitle="Choose how customers reach your AI team."
      >
        <button type="button" className="btn date-chip" onClick={() => {}}>
          Sample workspace
        </button>
      </PageHeader>

      <div className="calls-body">
        {apiState.status === 'error' && !data ? <ErrorBox error={apiState.error} /> : null}
        {neitherReady ? (
          <Note text={data?.note || sip?.note || 'Company phone numbers are not available yet.'} />
        ) : null}

        <div className="phone-options">
          <section className="panel phone-option">
            <div className="phone-icon" aria-hidden="true">＋</div>
            <h2>Get a new number</h2>
            <p>
              {canBuyLive
                ? 'Search available numbers by area code, review, and confirm. Monthly fee ends when you release the number.'
                : 'Search example US numbers by area code, review your selection, and preview checkout.'}
            </p>
            <Button className="btn btn--primary action" onClick={openFind}>Find a number</Button>
            {canBuyLive ? (
              <button type="button" className="btn btn--link link phone-sample-link" onClick={() => setWizard('find-sample')}>
                Preview sample flow instead
              </button>
            ) : null}
          </section>
          <section className="panel phone-option">
            <div className="phone-icon" aria-hidden="true">↗</div>
            <h2>Use your existing number</h2>
            <p>Keep your current business number and choose how to connect calls to your AI team.</p>
            <Button className="btn agent-btn" onClick={() => setWizard(attachable.length ? 'attach' : (showSipCard ? 'sip' : 'existing'))}>{attachable.length ? 'Use a number we already have' : 'Connect a number'}</Button>
          </section>
        </div>

        <Panel className="your-numbers-panel">
          <PanelHead
            title="Your numbers"
            subtitle={liveNumbers.length ? 'Live numbers for this workspace' : 'Sample status for this browser session'}
          />
          {apiState.status === 'loading' && !data && !sessionNumbers.length ? <Spinner /> : null}
          {liveNumbers.length ? (
            <div>
              {liveNumbers.map((n) => (
                <Row
                  key={n.phone_number}
                  leading="☎"
                  title={n.phone_number}
                  subtitle={`${n.country || 'US'} · ${n.status === 'active' ? 'Active' : 'Setting up'}`}
                  trailing={(
                    <>
                      <Badge text={n.status === 'active' ? 'Active' : 'Setting up'} tone={n.status === 'active' ? 'good' : 'warn'} />
                      <Button className="btn agent-btn" onClick={() => setReleasing(n)}>Release</Button>
                    </>
                  )}
                />
              ))}
            </div>
          ) : null}
          {sessionNumbers.length ? (
            <div>
              {sessionNumbers.map((entry, i) => (
                <Row
                  key={`${entry.number}-${i}`}
                  leading="☎"
                  title={entry.number}
                  subtitle={`${entry.method} · ${entry.description}`}
                  trailing={(
                    <>
                      <Badge text={entry.status} tone="warn" />
                      <Button
                        className="btn agent-btn"
                        aria-label={`View setup for ${entry.number}`}
                        onClick={() => setWizard({ detail: i })}
                      >
                        View setup
                      </Button>
                    </>
                  )}
                />
              ))}
            </div>
          ) : null}
          {!liveNumbers.length && !sessionNumbers.length && apiState.status !== 'loading' ? (
            <p className="sub">No numbers added yet. Select an option above to preview setup.</p>
          ) : null}
          {numbersLive && !data.can_buy ? (
            <p className="muted">{`A company can have ${data.max_numbers} phone number${data.max_numbers === 1 ? '' : 's'}. Release one to get a different one.`}</p>
          ) : null}
        </Panel>

        {showSipCard ? (
          <div className="numbers-sip">
            <SipCard sip={sip} reload={load} />
          </div>
        ) : null}

        <p className="page-foot">{foot}</p>
      </div>

      {wizard === 'attach' && attachable.length ? (
        <AttachNumberDialog options={attachable} onClose={() => setWizard(null)} onDone={load} />
      ) : null}
      {wizard === 'find-live' && canBuyLive ? (
        <LiveFindNumberWizard state={data} onClose={() => setWizard(null)} onPurchased={load} />
      ) : null}
      {wizard === 'find-sample' ? (
        <SampleFindNumberWizard onClose={() => setWizard(null)} onAdd={addSession} />
      ) : null}
      {wizard === 'existing' ? (
        <ExistingNumberWizard
          onClose={() => setWizard(null)}
          onAdd={addSession}
          onProviderConnect={() => setWizard('sip')}
        />
      ) : null}
      {wizard === 'sip' ? (
        sip?.enabled && sip?.ready ? (
          <ConnectDialog
            onClose={() => setWizard(null)}
            onConnected={(made) => {
              load();
              setWizard({ kind: 'sip-created', trunk: made });
            }}
          />
        ) : (
          <Dialog title="Provider connection" onClose={() => setWizard(null)}>
            <Note text={sip?.note || data?.note || 'Provider connection is not available yet for this workspace.'} />
            <div className="dialog-actions">
              <Button className="btn agent-btn" onClick={() => setWizard('existing')}>Back</Button>
            </div>
          </Dialog>
        )
      ) : null}
      {wizard?.kind === 'sip-created' ? (
        <SettingsDialog
          trunk={wizard.trunk}
          title="Now enter this at your provider"
          onClose={() => setWizard(null)}
        />
      ) : null}
      {wizard?.detail != null ? (
        <NumberDetailDialog
          entry={sessionNumbers[wizard.detail]}
          onClose={() => setWizard(null)}
          onRestart={() => {
            const entry = sessionNumbers[wizard.detail];
            setWizard(entry.kind === 'new' ? 'find-sample' : 'existing');
          }}
        />
      ) : null}
      {releasing ? (
        <ConfirmDialog
          title="Release this number"
          label="Release"
          tone="bad"
          onClose={() => setReleasing(null)}
          action={release(releasing)}
          text={`${releasing.phone_number} will stop ringing and texting your company, and the monthly fee ends. You may not be able to get the same number again.`}
        />
      ) : null}
    </div>
  );
}
