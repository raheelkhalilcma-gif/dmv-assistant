const { createClient } = require('@supabase/supabase-js');
const sendEmail = require('../services/sendEmail');
const sendSMS = require('../services/sendSMS');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ─────────────────────────────────────────────
// STATE SCRAPERS — GROUP 1 (Direct HTTP Check)
// ─────────────────────────────────────────────

async function checkCalifornia(office) {
  try {
    const CA_OFFICES = {
      'Los Angeles — Culver City': '548',
      'Los Angeles — Van Nuys': '531',
      'Los Angeles — Santa Monica': '608',
      'San Francisco — Fell St': '632',
      'San Diego — Normal St': '507',
      'Sacramento — Broadway': '683',
      'San Jose': '516',
      'Oakland — Claremont': '574',
      'Pasadena': '580',
      'Long Beach': '548',
    };
    const officeId = CA_OFFICES[office] || '548';
    const res = await axios.post(
      'https://www.dmv.ca.gov/wasapp/foa/findOfficeVisit.do',
      new URLSearchParams({ officeId, requestedTask: 'DL', numberOfCustomers: '1' }),
      { headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': 'https://www.dmv.ca.gov/portal/appointments/' }, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointmentDate') || html.includes('Select Date') ||
      (html.includes('available') && !html.includes('no appointments available'));
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('CA check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkTexas(office) {
  try {
    const res = await axios.get(
      'https://www.dps.texas.gov/section/driver-license/driver-license-office-wait-times-and-appointment-scheduling',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('no appointments');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('TX check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkNewYork(office) {
  try {
    const res = await axios.get(
      'https://dmv.ny.gov/appointment',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no available');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('NY check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkFlorida(office) {
  try {
    const res = await axios.get(
      'https://www.flhsmv.gov/driver-licenses-id-cards/appointments/',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('no appointments available');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('FL check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkIllinois(office) {
  try {
    const res = await axios.get(
      'https://www.ilsos.gov/appointments/',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no slots');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('IL check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkPennsylvania(office) {
  try {
    const res = await axios.get(
      'https://www.dmv.pa.gov/VEHICLE-SERVICES/Pages/default.aspx',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('no appointment');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('PA check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkOhio(office) {
  try {
    const res = await axios.get(
      'https://www.bmv.ohio.gov/locations.aspx',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('unavailable');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('OH check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkGeorgia(office) {
  try {
    const res = await axios.get(
      'https://online.dds.ga.gov/appointments/',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no appointments');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('GA check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkNorthCarolina(office) {
  try {
    const res = await axios.get(
      'https://www.ncdot.gov/dmv/offices-services/visit-dmv/pages/default.aspx',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('no appointment');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('NC check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkMichigan(office) {
  try {
    const res = await axios.get(
      'https://www.michigan.gov/sos/resources/branches',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('no appointment');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('MI check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkNewJersey(office) {
  try {
    const res = await axios.get(
      'https://www.nj.gov/mvc/license/driverslic.htm',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('appointment') && !html.includes('no appointment');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('NJ check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkVirginia(office) {
  try {
    const res = await axios.get(
      'https://www.dmv.virginia.gov/general/#appointments.asp',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no available');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('VA check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkWashington(office) {
  try {
    const res = await axios.get(
      'https://www.dol.wa.gov/appointments/',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no available');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('WA check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkArizona(office) {
  try {
    const res = await axios.get(
      'https://www.azmvdnow.gov/appointments',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no available');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('AZ check failed:', e.message);
    return { available: false, dates: [] };
  }
}

async function checkColorado(office) {
  try {
    const res = await axios.get(
      'https://dmv.colorado.gov/appointment-scheduling',
      { headers: DEFAULT_HEADERS, timeout: 15000 }
    );
    const html = res.data;
    const available = html.includes('available') && !html.includes('no available');
    const dates = [...new Set(html.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log('CO check failed:', e.message);
    return { available: false, dates: [] };
  }
}

// ─────────────────────────────────────────────
// GROUP 2 — Generic checker for remaining states
// ─────────────────────────────────────────────

const STATE_URLS = {
  'Alabama':        'https://www.alabamadmv.org/appointments',
  'Alaska':         'https://doa.alaska.gov/dmv/appointments',
  'Arkansas':       'https://www.dfa.arkansas.gov/offices/motorVehicle',
  'Connecticut':    'https://portal.ct.gov/DMV/Appointments',
  'Delaware':       'https://www.dmv.de.gov/appointments',
  'Hawaii':         'https://hidot.hawaii.gov/highways/motor-vehicle-safety-office/',
  'Idaho':          'https://itd.idaho.gov/dmv/',
  'Indiana':        'https://www.in.gov/bmv/appointments/',
  'Iowa':           'https://iowadot.gov/mvd/appointments',
  'Kansas':         'https://www.ksrevenue.gov/dovindex.html',
  'Kentucky':       'https://drive.ky.gov/Pages/appointments.aspx',
  'Louisiana':      'https://expresslane.dps.louisiana.gov/appointments',
  'Maine':          'https://www.maine.gov/sos/bmv/appointments',
  'Maryland':       'https://mva.maryland.gov/Pages/branch-offices.aspx',
  'Massachusetts':  'https://www.mass.gov/how-to/make-a-rmv-appointment',
  'Minnesota':      'https://dps.mn.gov/divisions/dvs/Pages/dvs-appointment.aspx',
  'Mississippi':    'https://www.dps.state.ms.us/driver-services/appointments',
  'Missouri':       'https://dor.mo.gov/motorv/appointments.php',
  'Montana':        'https://doj.mt.gov/driving/driver-licensing/',
  'Nebraska':       'https://dmv.nebraska.gov/appointments',
  'Nevada':         'https://dmv.nv.gov/appointments/',
  'New Hampshire':  'https://www.nh.gov/safety/divisions/dmv/appointments',
  'New Mexico':     'https://www.mvd.newmexico.gov/appointments',
  'North Dakota':   'https://www.dot.nd.gov/divisions/mv/mv.htm',
  'Oklahoma':       'https://www.ok.gov/dps/appointments',
  'Oregon':         'https://www.oregon.gov/ODOT/DMV/Pages/Appointments.aspx',
  'Rhode Island':   'https://dmv.ri.gov/appointments',
  'South Carolina': 'https://scdmvonline.com/appointments',
  'South Dakota':   'https://dps.sd.gov/driver-licensing/appointments',
  'Tennessee':      'https://www.tn.gov/safety/driver-services/appointments.html',
  'Utah':           'https://dmv.utah.gov/appointments',
  'Vermont':        'https://dmv.vermont.gov/appointments',
  'West Virginia':  'https://transportation.wv.gov/DMV/appointments',
  'Wisconsin':      'https://wisconsindmv.gov/appointments',
  'Wyoming':        'https://dot.wyo.gov/home/motorvehicle-home-page',
};

async function checkGenericState(state, office) {
  const url = STATE_URLS[state];
  if (!url) return { available: false, dates: [], note: 'URL not configured' };
  try {
    const res = await axios.get(url, { headers: DEFAULT_HEADERS, timeout: 15000 });
    const html = res.data.toLowerCase();
    const available =
      (html.includes('appointment') || html.includes('available') || html.includes('schedule')) &&
      !html.includes('no appointments available') &&
      !html.includes('no slots available') &&
      !html.includes('fully booked');
    const dates = [...new Set(res.data.match(/\d{2}\/\d{2}\/\d{4}/g) || [])].slice(0, 3);
    return { available, dates };
  } catch (e) {
    console.log(`${state} check failed:`, e.message);
    return { available: false, dates: [] };
  }
}

// ─────────────────────────────────────────────
// MASTER ROUTER — maps state to correct checker
// ─────────────────────────────────────────────

async function checkStateSlots(state, office) {
  switch (state) {
    case 'California':     return await checkCalifornia(office);
    case 'Texas':          return await checkTexas(office);
    case 'New York':       return await checkNewYork(office);
    case 'Florida':        return await checkFlorida(office);
    case 'Illinois':       return await checkIllinois(office);
    case 'Pennsylvania':   return await checkPennsylvania(office);
    case 'Ohio':           return await checkOhio(office);
    case 'Georgia':        return await checkGeorgia(office);
    case 'North Carolina': return await checkNorthCarolina(office);
    case 'Michigan':       return await checkMichigan(office);
    case 'New Jersey':     return await checkNewJersey(office);
    case 'Virginia':       return await checkVirginia(office);
    case 'Washington':     return await checkWashington(office);
    case 'Arizona':        return await checkArizona(office);
    case 'Colorado':       return await checkColorado(office);
    default:               return await checkGenericState(state, office);
  }
}

// ─────────────────────────────────────────────
// SEND ALERT — Email + SMS
// ─────────────────────────────────────────────

async function sendSlotAlert(user, alert, slotInfo) {
  const userName    = user.name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'there');
  const datesText   = slotInfo.dates.length > 0 ? slotInfo.dates.join(', ') : 'Check DMV website';
  const officeName  = alert.office       || 'DMV Office';
  const stateName   = alert.state        || 'Your State';
  const serviceType = alert.service_type || 'DMV Appointment';

  const STATE_BOOKING_URLS = {
    'California':     'https://www.dmv.ca.gov/wasapp/foa/searchAppts.do',
    'Texas':          'https://www.dps.texas.gov/section/driver-license/make-appointment',
    'New York':       'https://dmv.ny.gov/appointment',
    'Florida':        'https://www.flhsmv.gov/driver-licenses-id-cards/appointments/',
    'Illinois':       'https://www.ilsos.gov/appointments/',
    'Pennsylvania':   'https://www.dmv.pa.gov/VEHICLE-SERVICES/Pages/default.aspx',
    'Ohio':           'https://www.bmv.ohio.gov/locations.aspx',
    'Georgia':        'https://online.dds.ga.gov/appointments/',
    'North Carolina': 'https://www.ncdot.gov/dmv/offices-services/visit-dmv/',
    'Michigan':       'https://www.michigan.gov/sos',
    'New Jersey':     'https://www.nj.gov/mvc/',
    'Virginia':       'https://www.dmv.virginia.gov',
    'Washington':     'https://www.dol.wa.gov/appointments/',
    'Arizona':        'https://www.azmvdnow.gov/appointments',
    'Colorado':       'https://dmv.colorado.gov/appointment-scheduling',
  };

  const bookingUrl = STATE_BOOKING_URLS[alert.state] ||
    `https://www.google.com/search?q=${encodeURIComponent((alert.state || '') + ' DMV appointment')}`;

  // EMAIL — sendEmail.js ka exact format use kar rahe hain
  if (user.email) {
    try {
      await sendEmail({
        type:       'slot',
        to:         user.email,
        subject:    `DMV Slot Available — ${officeName}, ${stateName}!`,
        name:       userName,
        service:    serviceType,
        office:     officeName,
        state:      stateName,
        slotDate:   datesText,
        bookingUrl: bookingUrl,
      });
      console.log(`Email sent to ${user.email}`);
    } catch (e) {
      console.log('Email error:', e.message);
    }
  }

  // SMS — sendSMS.js ka exact format (message field, body nahi)
  if (user.phone && ['pro', 'family'].includes(user.plan)) {
    const smsMessage = `DMV Assistant: Slot AVAILABLE! ${serviceType} at ${officeName}, ${stateName}. Dates: ${datesText}. Book: ${bookingUrl}`;
    try {
      await sendSMS({
        to:      user.phone,
        message: smsMessage,
      });
      console.log(`SMS sent to ${user.phone}`);
    } catch (e) {
      console.log('SMS error:', e.message);
    }
  }

  // Alert history
  await supabase.from('alert_history').insert({
    user_id:  user.id,
    alert_id: alert.id,
    type:     'slot_found',
    message:  `Slot found at ${officeName}, ${stateName}. Dates: ${datesText}`,
    sent_at:  new Date().toISOString(),
  });

  // Alert update
  await supabase.from('alerts').update({
    last_alerted:    new Date().toISOString(),
    last_slot_found: datesText,
    status:          'slot_found',
  }).eq('id', alert.id);
}

// ─────────────────────────────────────────────
// MAIN — runs every 30 min via cron
// ─────────────────────────────────────────────

async function checkDMVSlots() {
  try {
    console.log('=== DMV Slot Check:', new Date().toLocaleTimeString(), '===');

    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('id, state, office, service_type, status, last_alerted, last_slot_found, notify_via, users(id, email, phone, plan, first_name, last_name, name)')
      .eq('status', 'active');

    if (error) { console.log('DB error:', error.message); return; }
    if (!alerts || alerts.length === 0) { console.log('No active alerts'); return; }

    console.log(`Found ${alerts.length} active alerts`);

    for (const alert of alerts) {
      const user = alert.users;
      if (!user) continue;

      if (alert.last_alerted) {
        const hrs = (Date.now() - new Date(alert.last_alerted)) / 3600000;
        if (hrs < 2) {
          console.log(`Skip — alerted ${hrs.toFixed(1)}h ago`);
          continue;
        }
      }

      console.log(`Checking ${alert.state} - ${alert.office || 'Main Office'}...`);
      const slotInfo = await checkStateSlots(alert.state, alert.office);

      if (slotInfo.available) {
        console.log(`SLOT FOUND at ${alert.office || alert.state}!`);
        await sendSlotAlert(user, alert, slotInfo);
      } else {
        console.log(`No slots at ${alert.office || alert.state}`);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('=== Check complete ===');
  } catch (err) {
    console.error('Fatal error:', err.message);
  }
}

module.exports = checkDMVSlots;
