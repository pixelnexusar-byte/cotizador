import { useEffect, useState } from 'react';
import { calculateSol, solDefaults, solModes } from './sol-pricing.mjs';

const format = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const settingsKey = 'cotizador-comex:sol-rates';

function Field({ label, value, onChange, styles, numeric = false }) {
  return (
    <label style={styles.label}>
      {label}
      <input style={{ ...styles.input, marginTop: 4 }} type={numeric ? 'number' : 'text'}
        min={numeric ? '0' : undefined} step={numeric ? 'any' : undefined}
        value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

export default function SolQuote({
  active, styles, clientName, clientPhone, product, hscode, weight, volume, goods,
  exchangeRate, exchangeRateLabel, sending, send
}) {
  const [mode, setMode] = useState('courier');
  const [settings, setSettings] = useState(solDefaults);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [autoRef, setAutoRef] = useState('');

  useEffect(() => {
    setAutoRef(`DCAM-${Math.floor(1000 + Math.random() * 9000)}`);
    try {
      const stored = JSON.parse(window.localStorage.getItem(settingsKey));
      if (stored) {
        setSettings({
          ...solDefaults,
          ...stored,
          rates: { ...solDefaults.rates, ...(stored.rates || {}) },
          enabled: { ...solDefaults.enabled, ...(stored.enabled || {}) },
          labels: { ...solDefaults.labels, ...(stored.labels || {}) },
          customItems: Array.isArray(stored.customItems) ? stored.customItems : []
        });
      }
    } catch {
      // Browser storage may be unavailable.
    }
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      window.localStorage.setItem(settingsKey, JSON.stringify({
        ...Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== '')),
        rates: Object.fromEntries(Object.entries(settings.rates).filter(([, value]) => value !== '')),
        enabled: settings.enabled,
        labels: settings.labels,
        customItems: settings.customItems
      }));
    } catch {
      // Keep edits usable in the current session.
    }
  }, [settings, settingsLoaded]);

  const [showFob, setShowFob] = useState(true);
  const [proforma, setProforma] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [document, setDocument] = useState({
    reference: '', issuer: 'De China al Mundo', issuerId: '', issuerAddress: '',
    buyerId: '', buyerAddress: '', quantity: '1', place: '', terms: '', validity: '7'
  });

  const fixed = mode === 'all';
  const quote = calculateSol({ mode, settings, goods, weight, volume });
  const error = quote.error || (!product.trim() ? 'Ingresá la descripción del producto.' : '');
  const invoiceError = proforma && (
    ![document.reference, document.issuer, document.issuerId, document.issuerAddress, clientName,
      document.buyerId, document.buyerAddress, document.place, document.terms].every(value => value.trim()) ||
    !(Number(document.quantity) > 0)
  );
  const title = proforma ? 'Factura proforma' : 'Cotización de importación';
  const rate = settings.rates[mode];
  const displayTotal = showFob ? quote.total : quote.service;
  const convertedAmount = displayTotal * exchangeRate;
  const date = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const displayRef = document.reference.trim() || autoRef;

  const valWeight = Number(weight) || 0;
  const valVolume = Number(volume) || 0;
  const volumetricWeight = Number((valVolume * 167).toFixed(2));
  const chargeableWeight = Math.max(valWeight, volumetricWeight);

  const setOption = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const setEnabled = (key, value) => setSettings(current => ({
    ...current, enabled: { ...current.enabled, [key]: value }
  }));
  const setLabel = (key, value) => setSettings(current => ({
    ...current, labels: { ...current.labels, [key]: value }
  }));
  const addCustomItem = () => setSettings(current => ({
    ...current,
    customItems: [...(current.customItems || []), { id: `custom-${Date.now()}`, enabled: true, label: 'Nuevo ítem', amount: '0' }]
  }));
  const updateCustomItem = (id, patch) => setSettings(current => ({
    ...current,
    customItems: (current.customItems || []).map(item => item.id === id ? { ...item, ...patch } : item)
  }));
  const removeCustomItem = (id) => setSettings(current => ({
    ...current,
    customItems: (current.customItems || []).filter(item => item.id !== id)
  }));
  const setDocumentField = (key, value) => setDocument(current => ({ ...current, [key]: value }));

  const summary = () => {
    const itemLines = [
      ...(showFob ? [`💵 Valor Mercadería (FOB): $${format.format(quote.fob)} USD`] : []),
      ...quote.lines.map(line => `• ${line.label}: $${format.format(line.amount)} USD`)
    ].join('\n');

    return `*COTIZACIÓN DE IMPORTACIÓN - DE CHINA AL MUNDO*
----------------------------------------
👤 Cliente: ${clientName || 'Consumidor Final'}
📦 Producto: ${product || 'Mercadería General'}
📑 Posición Arancelaria: ${hscode || 'A clasificar'}
🌐 Término: FOB${document.place.trim() ? ` (${document.place.trim()})` : ''}
🚢 Modalidad: ${solModes[mode].label}
----------------------------------------
${itemLines}
----------------------------------------
💰 ${showFob ? 'TOTAL ESTIMADO DE LA OPERACIÓN' : 'TOTAL SERVICIO LOGÍSTICO E IMPUESTOS'}: $${format.format(displayTotal)} USD${exchangeRate > 0 ? `\n🇦🇷 Total en Pesos: ARS ${format.format(convertedAmount)} (${exchangeRateLabel} ${exchangeRate})` : ''}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary());
      setCopyStatus('Resumen copiado.');
    } catch {
      setCopyStatus('No se pudo copiar el resumen.');
    }
  };

  const itemRowStyle = {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr 110px auto',
    gap: 8,
    alignItems: 'center',
    background: '#1e293b',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #334155'
  };

  return (
    <>
      <div className="no-print" style={{ ...styles.panel, display: active ? undefined : 'none' }}>
        <div style={styles.modeGrid} role="group" aria-label="Modalidad de envío">
          {Object.entries(solModes).map(([key, item]) => (
            <button key={key} type="button" aria-pressed={mode === key}
              style={mode === key ? styles.modeBtnActive : styles.modeBtn} onClick={() => setMode(key)}>
              {item.label}
              <span style={styles.subtext}>{settings.rates[key]} USD / {item.unit}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16, background: '#0f172a', padding: 14, borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 'bold', color: '#f1f5f9' }}>
              ⚙️ Ítems, impuestos y tarifas (editables):
            </span>
            <button type="button" onClick={addCustomItem}
              style={{ background: '#334155', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              + Agregar ítem
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {fixed ? (
              <div style={itemRowStyle}>
                <input type="checkbox" checked={settings.enabled.all} onChange={e => setEnabled('all', e.target.checked)} />
                <input style={styles.input} type="text" disabled={!settings.enabled.all}
                  value={settings.labels.all} onChange={e => setLabel('all', e.target.value)} />
                <input style={styles.input} type="number" min="0" step="any" disabled={!settings.enabled.all}
                  value={rate} onChange={e => setSettings(current => ({ ...current, rates: { ...current.rates, [mode]: e.target.value } }))} />
                <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 52 }}>USD</span>
              </div>
            ) : (
              <>
                <div style={itemRowStyle}>
                  <input type="checkbox" checked={settings.enabled.freight} onChange={e => setEnabled('freight', e.target.checked)} />
                  <input style={styles.input} type="text" disabled={!settings.enabled.freight}
                    value={settings.labels.freight} onChange={e => setLabel('freight', e.target.value)} />
                  <input style={styles.input} type="number" min="0" step="any" disabled={!settings.enabled.freight}
                    value={rate} onChange={e => setSettings(current => ({ ...current, rates: { ...current.rates, [mode]: e.target.value } }))} />
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 52 }}>USD/{solModes[mode].unit}</span>
                </div>

                <div style={itemRowStyle}>
                  <input type="checkbox" checked={settings.enabled.insurance} onChange={e => setEnabled('insurance', e.target.checked)} />
                  <input style={styles.input} type="text" disabled={!settings.enabled.insurance}
                    value={settings.labels.insurance} onChange={e => setLabel('insurance', e.target.value)} />
                  <input style={styles.input} type="number" min="0" step="any" disabled={!settings.enabled.insurance}
                    value={settings.insurance} onChange={e => setOption('insurance', e.target.value)} />
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 52 }}>% FOB</span>
                </div>

                <div style={itemRowStyle}>
                  <input type="checkbox" checked={settings.enabled.taxes} onChange={e => setEnabled('taxes', e.target.checked)} />
                  <input style={styles.input} type="text" disabled={!settings.enabled.taxes}
                    value={settings.labels.taxes} onChange={e => setLabel('taxes', e.target.value)} />
                  <input style={styles.input} type="number" min="0" step="any" disabled={!settings.enabled.taxes}
                    value={settings.taxes} onChange={e => setOption('taxes', e.target.value)} />
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 52 }}>% FOB</span>
                </div>

                <div style={itemRowStyle}>
                  <input type="checkbox" checked={settings.enabled.fee} onChange={e => setEnabled('fee', e.target.checked)} />
                  <input style={styles.input} type="text" disabled={!settings.enabled.fee}
                    value={settings.labels.fee} onChange={e => setLabel('fee', e.target.value)} />
                  <input style={styles.input} type="number" min="0" step="any" disabled={!settings.enabled.fee}
                    value={settings.fee} onChange={e => setOption('fee', e.target.value)} />
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 52 }}>USD</span>
                </div>
              </>
            )}

            {(settings.customItems || []).map(item => (
              <div key={item.id} style={itemRowStyle}>
                <input type="checkbox" checked={item.enabled} onChange={e => updateCustomItem(item.id, { enabled: e.target.checked })} />
                <input style={styles.input} type="text" disabled={!item.enabled}
                  value={item.label} onChange={e => updateCustomItem(item.id, { label: e.target.value })} placeholder="Nombre del ítem" />
                <input style={styles.input} type="number" min="0" step="any" disabled={!item.enabled}
                  value={item.amount} onChange={e => updateCustomItem(item.id, { amount: e.target.value })} placeholder="0" />
                <button type="button" onClick={() => removeCustomItem(item.id)} title="Eliminar ítem"
                  style={{ background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 8px', cursor: 'pointer', fontSize: 11 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...styles.formGrid, marginTop: 16 }}>
          <label style={styles.label}>
            Documento
            <select style={{ ...styles.select, marginTop: 4 }} value={proforma ? 'proforma' : 'quote'}
              onChange={event => setProforma(event.target.value === 'proforma')}>
              <option value="quote">Cotización comercial</option>
              <option value="proforma">Factura proforma</option>
            </select>
          </label>
          <Field label="Referencia" styles={styles} value={document.reference}
            onChange={value => setDocumentField('reference', value)} />
          <Field label="Validez (días hábiles)" styles={styles} numeric value={document.validity}
            onChange={value => setDocumentField('validity', value)} />
        </div>

        <label style={{ ...styles.checkboxLabel, marginTop: 12 }}>
          <input type="checkbox" checked={showFob} onChange={event => setShowFob(event.target.checked)} />
          Mostrar valor FOB al cliente (si se destilda, tampoco se suma al total)
        </label>

        {proforma && (
          <div style={{ ...styles.formGrid, marginTop: 12 }}>
            {[
              ['issuer', 'Emisor / Razón social'], ['issuerId', 'Identificación fiscal del emisor'],
              ['issuerAddress', 'Domicilio del emisor'], ['buyerId', 'Identificación fiscal del cliente'],
              ['buyerAddress', 'Domicilio del cliente'], ['quantity', 'Cantidad de unidades'],
              ['place', 'Puerto o lugar acordado (FOB)'], ['terms', 'Condiciones de pago']
            ].map(([key, label]) => (
              <Field key={key} label={label} styles={styles} numeric={key === 'quantity'}
                value={document[key]} onChange={value => setDocumentField(key, value)} />
            ))}
          </div>
        )}

        <p role="status" style={{ color: '#fcd34d', marginTop: 12, fontSize: 13 }}>
          {error || (invoiceError ? 'Completá la referencia, los datos de ambas partes, la cantidad, el lugar FOB y las condiciones de pago para imprimir la proforma.' : copyStatus)}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <button type="button" style={styles.printBtn} disabled={Boolean(error || invoiceError)}
            onClick={() => window.print()}>Imprimir / Guardar PDF</button>
          <button type="button" style={styles.waBtn} disabled={Boolean(error || sending)}
            onClick={() => send(summary())}>{sending ? 'Enviando…' : 'Enviar por WhatsApp'}</button>
          <button type="button" style={styles.copyBtn} disabled={Boolean(error)}
            onClick={copy}>Copiar resumen</button>
        </div>
      </div>

      {active && !error && !invoiceError && (
        <article className="print-sheet sol-sheet" style={{ ...styles.quoteCard, overflowWrap: 'anywhere' }}>
          <header style={styles.quoteHeader}>
            <img src="/logo.png" alt="De China al Mundo" style={{ maxHeight: '55px', objectFit: 'contain' }} />
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ margin: 0, fontSize: '18px', color: '#881337', fontWeight: '900' }}>{title.toUpperCase()}</h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                Fecha: {date}{displayRef && ` | Ref: ${displayRef}`}
              </p>
            </div>
          </header>

          <hr style={styles.hrDivider} />

          <div style={styles.twoColGrid}>
            <div>
              <h3 style={styles.sectionHeading}>DATOS DEL CLIENTE</h3>
              <p style={styles.dataRow}><strong>Cliente:</strong> {clientName || 'Consumidor Final'}</p>
              {clientPhone && <p style={styles.dataRow}><strong>Contacto:</strong> +{clientPhone}</p>}
              <p style={styles.dataRow}><strong>Producto:</strong> {product || 'Mercadería General'}</p>
              <p style={styles.dataRow}><strong>Posición:</strong> {hscode || 'A clasificar'}</p>
              <p style={styles.dataRow}><strong>Término de Compra:</strong> FOB{document.place.trim() ? ` (${document.place.trim()})` : ''}</p>
            </div>
            <div>
              <h3 style={styles.sectionHeading}>DETALLE LOGÍSTICO</h3>
              <p style={styles.dataRow}><strong>Modalidad:</strong> {solModes[mode].label}</p>
              <p style={styles.dataRow}><strong>Peso / Vol.:</strong> {valWeight} kg | {valVolume} m³</p>
              <p style={styles.dataRow}><strong>Peso Facturable:</strong> {chargeableWeight} kg</p>
            </div>
          </div>

          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th scope="col" style={styles.th}>CONCEPTO</th>
                <th scope="col" style={styles.thCenter}>DETALLE</th>
                <th scope="col" style={styles.thRight}>IMPORTE (USD)</th>
              </tr>
            </thead>
            <tbody>
              {showFob && <tr>
                <td style={styles.td}>Valor Mercadería (FOB)</td>
                <td style={styles.tdCenter}>-</td>
                <td style={styles.tdRight}>{format.format(quote.fob)}</td>
              </tr>}
              {quote.lines.map(line => (
                <tr key={line.key || line.label}>
                  <td style={styles.td}>{line.label}</td>
                  <td style={styles.tdCenter}>{line.detail}</td>
                  <td style={styles.tdRight}>{format.format(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={styles.tfootRow}>
                <td colSpan={2} style={styles.tdTotalLabel}>
                  {showFob ? 'TOTAL ESTIMADO DE LA OPERACIÓN (USD):' : 'TOTAL SERVICIO LOGÍSTICO E IMPUESTOS (USD):'}
                </td>
                <td style={styles.tdTotalValue}>${format.format(displayTotal)}</td>
              </tr>
              {exchangeRate > 0 && (
                <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1' }}>
                  <td colSpan={2} style={{ ...styles.tdTotalLabel, color: '#0f172a' }}>
                    TOTAL EQUIVALENTE EN PESOS ({exchangeRateLabel} ${exchangeRate}):
                  </td>
                  <td style={{ ...styles.tdTotalValue, color: '#0f172a' }}>
                    ${format.format(convertedAmount)} ARS
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
          <div style={styles.notesBox}>
            <p style={styles.dataRow}>Validez: {document.validity || 7} días hábiles sujeta a confirmación de bodega.</p>
            <p style={styles.dataRow}>Valores impositivos oficiales según reglamentación aduanera vigente.</p>
          </div>
        </article>
      )}
    </>
  );
}