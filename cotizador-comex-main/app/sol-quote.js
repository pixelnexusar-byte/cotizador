import { useEffect, useState } from 'react';
import { calculateSol, solDefaults, solModes } from './sol-pricing.mjs';

const format = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const settingsKey = 'cotizador-comex:sol-rates';
const usd = value => `USD ${format.format(value)}`;

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
      if (stored) setSettings({ ...solDefaults, ...stored, rates: { ...solDefaults.rates, ...stored.rates } });
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
        rates: Object.fromEntries(Object.entries(settings.rates).filter(([, value]) => value !== ''))
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
  const conversionLabel = showFob ? 'Equivalente con mercadería' : 'Equivalente del servicio';
  const convertedAmount = (showFob ? quote.total : quote.service) * exchangeRate;
  const date = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const displayRef = document.reference.trim() || autoRef;

  const valWeight = Number(weight) || 0;
  const valVolume = Number(volume) || 0;
  const volumetricWeight = Number((valVolume * 167).toFixed(2));
  const chargeableWeight = Math.max(valWeight, volumetricWeight);

  const setOption = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const setDocumentField = (key, value) => setDocument(current => ({ ...current, [key]: value }));

  const summary = () => {
    const fleteLine = quote.lines.find(l => l.label.includes('Flete'))?.amount || 0;
    const seguroLine = quote.lines.find(l => l.label.includes('Seguro'))?.amount || 0;
    const impLine = quote.lines.find(l => l.label.includes('Impuestos'))?.amount || 0;
    const honLine = quote.lines.find(l => l.label.includes('Honorarios'))?.amount || settings.fee;

    return `*COTIZACIÓN DE IMPORTACIÓN - DE CHINA AL MUNDO*
----------------------------------------
👤 Cliente: ${clientName || 'Consumidor Final'}
📦 Producto: ${product || 'Mercadería General'}
📑 Posición Arancelaria: ${hscode || 'A clasificar'}
🌐 Término: FOB${document.place.trim() ? ` (${document.place.trim()})` : ''}
🚢 Modalidad: ${solModes[mode].label}
----------------------------------------
✈️ Flete Internacional: $${format.format(fleteLine)} USD
🛡️ Seguro Estimado: $${format.format(seguroLine)} USD
🏛️ Impuestos y Aduana: $${format.format(impLine)} USD
🤝 Honorarios DCAM: $${format.format(honLine)} USD
----------------------------------------
💰 TOTAL ESTIMADO DE LA OPERACIÓN: $${format.format(quote.total)} USD${exchangeRate > 0 ? `\n🇦🇷 Total en Pesos: ARS ${format.format(convertedAmount)} (${exchangeRateLabel} ${exchangeRate})` : ''}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary());
      setCopyStatus('Resumen copiado.');
    } catch {
      setCopyStatus('No se pudo copiar el resumen.');
    }
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
        <div style={{ ...styles.formGrid, marginTop: 16 }}>
          <Field label={fixed ? 'Precio cerrado (USD)' : `Tarifa (USD / ${solModes[mode].unit})`}
            styles={styles} numeric value={rate} onChange={value => setSettings(current => ({
              ...current, rates: { ...current.rates, [mode]: value }
            }))} />
          <Field label="Seguro (% del FOB)" styles={styles} numeric value={settings.insurance}
            onChange={value => setOption('insurance', value)} />
          <Field label="Impuestos est. (% del FOB)" styles={styles} numeric value={settings.taxes}
            onChange={value => setOption('taxes', value)} />
          <Field label="Honorarios (USD)" styles={styles} numeric value={settings.fee}
            onChange={value => setOption('fee', value)} />
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
          Mostrar valor FOB al cliente
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
                <tr key={line.label}>
                  <td style={styles.td}>{line.label}</td>
                  <td style={styles.tdCenter}>{line.detail}</td>
                  <td style={styles.tdRight}>{format.format(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={styles.tfootRow}>
                <td colSpan={2} style={styles.tdTotalLabel}>TOTAL ESTIMADO DE LA OPERACIÓN (USD):</td>
                <td style={styles.tdTotalValue}>${format.format(quote.total)}</td>
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
