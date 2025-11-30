(function() {
  const API_BASE = '';
  let authToken = localStorage.getItem('admin_token') || null;
  let livePortfolio = {};

  function setAuthToken(token) {
    authToken = token;
    if (token) localStorage.setItem('admin_token', token);
    else localStorage.removeItem('admin_token');
  }

  function api(path, options = {}) {
    const headers = options.headers || {};
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    if (!options.body && options.json) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.json);
    }
    return fetch(API_BASE + path, { ...options, headers })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json().catch(() => ({}));
      });
  }

  // Helper: upload a file (image/video) to the server and return { success, url, fileName }
  function uploadFileToServer(file, folder) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result;
        api('/api/upload', {
          method: 'POST',
          json: {
            fileName: file.name,
            content,
            folder: folder || ''
          }
        })
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Login handling
  const loginEl = document.getElementById('admin-login');
  const shellEl = document.getElementById('admin-shell');
  const loginBtn = document.getElementById('login-btn');
  const pwdInput = document.getElementById('admin-password');
  const loginError = document.getElementById('login-error');

  function showShell() {
    loginEl.style.display = 'none';
    shellEl.style.display = 'block';
    initTabs();
    loadPortfolio();
    loadMessages();
    loadInvoices();
  }

  loginBtn.addEventListener('click', () => {
    const password = pwdInput.value.trim();
    loginError.style.display = 'none';
    api('/api/login', { method: 'POST', json: { password } })
      .then(data => {
        if (!data.token) throw new Error('no-token');
        setAuthToken(data.token);
        showShell();
      })
      .catch(() => {
        loginError.style.display = 'block';
      });
  });

  if (authToken) {
    api('/api/messages')
      .then(() => showShell())
      .catch(() => setAuthToken(null));
  }

  // Tabs
  function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    const panels = {
      portfolio: document.getElementById('tab-portfolio'),
      messages: document.getElementById('tab-messages'),
      billing: document.getElementById('tab-billing')
    };
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        Object.values(panels).forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        panels[tab].classList.add('active');
        if (tab === 'messages') loadMessages();
        if (tab === 'billing') loadInvoices();
      });
    });
  }

  // Portfolio editing
  const portfolioFormEl = document.getElementById('portfolio-form');
  const portfolioPreviewEl = document.getElementById('portfolio-preview');

  function buildPortfolioForm(data) {
    livePortfolio = data || {};
    portfolioFormEl.innerHTML = '';

    function fieldRow(key, label, value, multiline) {
      const wrap = document.createElement('div');
      wrap.className = 'field-group';
      const id = 'pf_' + key;
      wrap.innerHTML = `
        <label for="${id}">${label}</label>
        ${multiline
          ? `<textarea id="${id}" data-key="${key}">${value || ''}</textarea>`
          : `<input id="${id}" data-key="${key}" value="${value || ''}">`
        }
      `;
      portfolioFormEl.appendChild(wrap);
    }

    function addUploadControl(targetKey, label, accept, folder) {
      const baseInput = portfolioFormEl.querySelector(`[data-key="${targetKey}"]`);
      if (!baseInput) return;
      const container = document.createElement('div');
      container.className = 'field-group';
      const uploadId = 'pf_upload_' + targetKey.replace(/\./g, '_');
      container.innerHTML = `
        <label for="${uploadId}">${label}</label>
        <input id="${uploadId}" type="file" accept="${accept}">
      `;
      baseInput.parentElement.insertAdjacentElement('afterend', container);
      const fileInput = container.querySelector('input[type="file"]');
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        fileInput.disabled = true;
        uploadFileToServer(file, folder)
          .then(info => {
            if (info && (info.url || info.fileName)) {
              baseInput.value = info.url || info.fileName;
              baseInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          })
          .catch(() => {
            alert('Failed to upload file.');
          })
          .finally(() => {
            fileInput.value = '';
            fileInput.disabled = false;
          });
      });
    }

    // Navigation
    fieldRow('navigation.brand', 'Brand name', (data.navigation && data.navigation.brand) || 'Vrutant');
    fieldRow('navigation.subtitle', 'Brand subtitle', (data.navigation && data.navigation.subtitle) || 'Video Editor');
    fieldRow('navigationMenuText', 'Navigation menu (label | href per line)',
      (data.navigation && Array.isArray(data.navigation.menu)
        ? data.navigation.menu.map(m => `${m.label || ''} | ${m.href || ''}`).join('\\n')
        : ''
      ),
      true
    );

    fieldRow('personal.title', 'Hero title (use \\n for new line)', (data.personal && data.personal.title) || '', true);
    fieldRow('personal.description', 'Hero description', (data.personal && data.personal.description) || '', true);
    fieldRow('personal.availability', 'Availability text', (data.personal && data.personal.availability) || 'Available for Projects');
    fieldRow('hero.image', 'Hero image filename', (data.hero && data.hero.image) || 'Instagram post - 21.jpg.png');
    fieldRow('about.title', 'About title', (data.about && data.about.title) || 'About Me');
    fieldRow('about.intro', 'About intro', (data.about && data.about.intro) || '', true);
    fieldRow('about.description', 'About description', (data.about && data.about.description) || '', true);
    fieldRow('about.mainImage', 'About main image filename', (data.about && data.about.mainImage) || 'v_image2.jpg');
    fieldRow('about.smallImage', 'About secondary image filename', (data.about && data.about.smallImage) || 'v3.jpg.webp');

    // Experience / section headings
    fieldRow('experienceSection.title', 'Experience section title', data.experienceSection && data.experienceSection.title, false);
    fieldRow('experienceSection.subtitle', 'Experience section subtitle', data.experienceSection && data.experienceSection.subtitle, true);

    fieldRow('stats.projects', 'Projects stat (e.g. 50+)', data.stats && data.stats.projects, false);
    fieldRow('stats.experience', 'Experience stat', data.stats && data.stats.experience, false);
    fieldRow('stats.clients', 'Clients stat', data.stats && data.stats.clients, false);
    fieldRow('stats.awards', 'Awards stat', data.stats && data.stats.awards, false);

    fieldRow('metrics.projects', 'Metrics: Projects line', data.metrics && data.metrics.projects, false);
    fieldRow('metrics.clients', 'Metrics: Clients line', data.metrics && data.metrics.clients, false);
    fieldRow('metrics.awards', 'Metrics: Awards line', data.metrics && data.metrics.awards, false);

    // Project breakdown (name | count text | percent per line)
    fieldRow('projectBreakdownText', 'Project breakdown (name | count text | percent per line)',
      (data.projectBreakdown || []).map(p => `${p.name || ''} | ${p.countText || ''} | ${typeof p.percentage === 'number' ? p.percentage : ''}`).join('\\n'),
      true
    );

    // Lists below use helper parsing on save
    fieldRow('careerText', 'Career Journey (one entry per line)', (data.career || []).join('\\n'), true);
    fieldRow('techStackText', 'Tech Stack (one tool per line)', (data.techStack || []).join('\n'), true);
    fieldRow('recognitionText', 'Latest Recognition (icon | title | event per line)',
      (data.recognition || []).map(r => `${r.icon || ''} | ${r.title || ''} | ${r.event || ''}`).join('\n'),
      true
    );
    fieldRow('testimonialsText', 'Testimonials (quote | author per line)',
      (data.testimonials || []).map(t => `${t.quote || ''} | ${t.author || ''}`).join('\\n'),
      true
    );

    // Services row (icon | title | description | type(link/video) | linkOrFile per line)
    fieldRow('servicesRowText', 'Services row (icon | title | description | type | link-or-file per line)',
      (data.servicesRow || []).map(s => `${s.icon || ''} | ${s.title || ''} | ${s.description || ''} | ${s.type || ''} | ${s.link || s.videoFile || ''}`).join('\\n'),
      true
    );

    // Projects list (title | description | type(link/video) | link-or-file | views text | engagement text per line)
    fieldRow('projectsText', 'Projects (title | description | type | link-or-file | views | engagement per line)',
      (data.projects || []).map(p => `${p.title || ''} | ${p.description || ''} | ${p.type || ''} | ${p.link || p.videoFile || ''} | ${p.views || ''} | ${p.engagement || ''}`).join('\\n'),
      true
    );

    // Projects section heading
    fieldRow('projectsSection.title', 'Projects section title', data.projectsSection && data.projectsSection.title, false);
    fieldRow('projectsSection.subtitle', 'Projects section subtitle', data.projectsSection && data.projectsSection.subtitle, true);

    fieldRow('contact.title', 'Contact section title', data.contact && data.contact.title, false);
    fieldRow('contact.subtitle', 'Contact section subtitle', data.contact && data.contact.subtitle, true);
    fieldRow('contact.infoHeading', 'Contact info heading', data.contact && data.contact.infoHeading, false);
    fieldRow('contact.infoBody', 'Contact info body', data.contact && data.contact.infoBody, true);
    fieldRow('contact.socialHeading', 'Social heading', data.contact && data.contact.socialHeading, false);

    fieldRow('contact.details.email', 'Contact email', data.contact && data.contact.details && data.contact.details.email, false);
    fieldRow('contact.details.phone', 'Contact phone', data.contact && data.contact.details && data.contact.details.phone, false);
    fieldRow('contact.details.location', 'Contact location', data.contact && data.contact.details && data.contact.details.location, false);

    // Footer
    fieldRow('footer.name', 'Footer name', data.footer && data.footer.name, false);
    fieldRow('footer.role', 'Footer role', data.footer && data.footer.role, false);
    fieldRow('footer.copyright', 'Footer copyright text', data.footer && data.footer.copyright, false);

    // Theme colors
    fieldRow('theme.primary', 'Primary accent color (e.g. #7c3aed)', data.theme && data.theme.primary, false);
    fieldRow('theme.secondary', 'Secondary accent color (e.g. #3b82f6)', data.theme && data.theme.secondary, false);
    fieldRow('theme.background', 'Background color (e.g. #000000)', data.theme && data.theme.background, false);
    fieldRow('theme.text', 'Base text color (e.g. #ffffff)', data.theme && data.theme.text, false);

    // File upload controls for key images
    addUploadControl('hero.image', 'Upload hero image (replaces hero placeholder)', 'image/*', 'images');
    addUploadControl('about.mainImage', 'Upload about main image', 'image/*', 'images');
    addUploadControl('about.smallImage', 'Upload about secondary image', 'image/*', 'images');

    portfolioFormEl.querySelectorAll('input,textarea').forEach(el => {
      el.addEventListener('input', updatePreviewFromForm);
    });

    updatePreviewFromForm();
  }

  function setDeep(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function applyVirtualFieldsFromForm(clone) {
    // Navigation menu (label | href per line)
    const navEl = portfolioFormEl.querySelector('[data-key="navigationMenuText"]');
    if (navEl) {
      const menu = navEl.value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        return { label: parts[0] || '', href: parts[1] || '#' };
      });
      if (!clone.navigation || typeof clone.navigation !== 'object') clone.navigation = {};
      clone.navigation.menu = menu;
    }

    // Project breakdown (name | count text | percent per line)
    const pbEl = portfolioFormEl.querySelector('[data-key="projectBreakdownText"]');
    if (pbEl) {
      const items = pbEl.value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        return {
          name: parts[0] || '',
          countText: parts[1] || '',
          percentage: parts[2] ? Number(parts[2]) || 0 : 0
        };
      });
      clone.projectBreakdown = items;
    }

    // Career (array of strings)
    const careerEl = portfolioFormEl.querySelector('[data-key="careerText"]');
    if (careerEl) {
      const lines = careerEl.value.split('\n').map(s => s.trim()).filter(Boolean);
      clone.career = lines;
    }
    // Tech stack (array of strings)
    const techEl = portfolioFormEl.querySelector('[data-key="techStackText"]');
    if (techEl) {
      const tools = techEl.value.split('\n').map(s => s.trim()).filter(Boolean);
      clone.techStack = tools;
    }
    // Recognition (icon | title | event per line)
    const recEl = portfolioFormEl.querySelector('[data-key="recognitionText"]');
    if (recEl) {
      const items = recEl.value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        return { icon: parts[0] || '', title: parts[1] || '', event: parts[2] || '' };
      });
      clone.recognition = items;
    }
    // Testimonials (quote | author per line)
    const testEl = portfolioFormEl.querySelector('[data-key="testimonialsText"]');
    if (testEl) {
      const items = testEl.value.split('\\n').map(s => s.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        return { quote: parts[0] || '', author: parts[1] || '' };
      });
      clone.testimonials = items;
    }

    // Services row (icon | title | description | type | link-or-file per line)
    const svcEl = portfolioFormEl.querySelector('[data-key=\"servicesRowText\"]');
    if (svcEl) {
      const items = svcEl.value.split('\\n').map(s => s.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        const type = parts[3] || 'link';
        const linkOrFile = parts[4] || '';
        const base = { icon: parts[0] || '', title: parts[1] || '', description: parts[2] || '', type };
        if (type === 'video') {
          return { ...base, videoFile: linkOrFile };
        }
        return { ...base, link: linkOrFile };
      });
      clone.servicesRow = items;
    }

    // Projects (title | description | type | link-or-file | views | engagement per line)
    const projEl = portfolioFormEl.querySelector('[data-key=\"projectsText\"]');
    if (projEl) {
      const items = projEl.value.split('\\n').map(s => s.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(p => p.trim());
        const type = parts[2] || 'link';
        const linkOrFile = parts[3] || '';
        const base = {
          title: parts[0] || '',
          description: parts[1] || '',
          type,
          views: parts[4] || '',
          engagement: parts[5] || ''
        };
        if (type === 'video') {
          return { ...base, videoFile: linkOrFile };
        }
        return { ...base, link: linkOrFile };
      });
      clone.projects = items;
    }
  }

  function updatePreviewFromForm() {
    const clone = JSON.parse(JSON.stringify(livePortfolio || {}));
    portfolioFormEl.querySelectorAll('input,textarea').forEach(el => {
      const key = el.getAttribute('data-key');
      if (!key) return;
      setDeep(clone, key, el.value);
    });
    applyVirtualFieldsFromForm(clone);

    const title = (clone.personal && clone.personal.title) || '';
    const desc = (clone.personal && clone.personal.description) || '';
    const aboutTitle = (clone.about && clone.about.title) || '';
    const aboutIntro = (clone.about && clone.about.intro) || '';

    portfolioPreviewEl.innerHTML = `
      <h3 style="margin-bottom:0.5rem;">Hero</h3>
      <div style="padding:0.75rem 1rem;border-radius:10px;background:#050505;border:1px solid #333;margin-bottom:1rem;">
        <div style="font-weight:600;margin-bottom:0.25rem;">${title.replace(/\n/g, '<br>')}</div>
        <div style="font-size:0.85rem;color:#aaa;">${desc}</div>
      </div>
      <h3 style="margin-top:1rem;margin-bottom:0.5rem;">About</h3>
      <div style="padding:0.75rem 1rem;border-radius:10px;background:#050505;border:1px solid #333;">
        <div style="font-weight:600;margin-bottom:0.25rem;">${aboutTitle}</div>
        <div style="font-size:0.85rem;color:#aaa;margin-bottom:0.5rem;">${aboutIntro}</div>
      </div>
    `;
  }

  function getFormPortfolioData() {
    const clone = JSON.parse(JSON.stringify(livePortfolio || {}));
    portfolioFormEl.querySelectorAll('input,textarea').forEach(el => {
      const key = el.getAttribute('data-key');
      if (!key) return;
      setDeep(clone, key, el.value);
    });
    applyVirtualFieldsFromForm(clone);
    return clone;
  }

  function loadPortfolio() {
    fetch('/portfolio_data.json?' + Date.now())
      .then(res => res.json())
      .then(data => {
        buildPortfolioForm(data || {});
      })
      .catch(() => {
        buildPortfolioForm({});
      });
  }

  document.getElementById('save-portfolio').addEventListener('click', () => {
    const data = getFormPortfolioData();
    api('/api/portfolio', { method: 'PUT', json: data })
      .then(() => {
        try {
          // Trigger realtime update in any open portfolio tab
          localStorage.setItem('vr_portfolio_live_data', JSON.stringify(data));
        } catch (e) {
          console.warn('Failed to write live portfolio data to localStorage', e);
        }
        alert('Portfolio saved. Any open portfolio tab will update automatically.');
        loadPortfolio();
      })
      .catch(() => alert('Failed to save portfolio.'));
  });

  document.getElementById('reload-portfolio').addEventListener('click', () => {
    loadPortfolio();
  });

  // Messages
  const messagesListEl = document.getElementById('messages-list');

  function loadMessages() {
    api('/api/messages')
      .then(msgs => {
        messagesListEl.innerHTML = '';
        (msgs || []).slice().reverse().forEach(m => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.innerHTML = `
            <div class="list-item-main">
              <div style="font-weight:600;">${m.first_name || ''} ${m.last_name || ''}
                ${m.read ? '<span class="badge" style="color:#22c55e;border-color:#22c55e;">Read</span>' : '<span class="badge" style="color:#f97316;border-color:#f97316;">New</span>'}
              </div>
              <div style="font-size:0.8rem;color:#aaa;margin:0.15rem 0;">${m.email || ''}</div>
              <div style="font-size:0.85rem;margin-top:0.25rem;">${m.subject || ''}</div>
              <div style="font-size:0.8rem;color:#ccc;margin-top:0.25rem;white-space:pre-wrap;">${m.message || ''}</div>
            </div>
            <div class="list-item-actions">
              <button style="padding:0.3rem 0.6rem;border-radius:6px;border:none;background:#22c55e;color:#000;font-size:0.75rem;" data-action="read">Mark read</button>
              <button style="padding:0.3rem 0.6rem;border-radius:6px;border:none;background:#ef4444;color:#fff;font-size:0.75rem;" data-action="delete">Delete</button>
            </div>
          `;
          item.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
              const action = btn.getAttribute('data-action');
              if (action === 'read') {
                api('/api/messages/' + m.id, { method: 'PATCH', json: { read: true } })
                  .then(loadMessages);
              } else if (action === 'delete') {
                if (!confirm('Delete this message?')) return;
                api('/api/messages/' + m.id, { method: 'DELETE' })
                  .then(loadMessages);
              }
            });
          });
          messagesListEl.appendChild(item);
        });
      })
      .catch(() => {
        messagesListEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;">Failed to load messages.</p>';
      });
  }

  // Invoices
  const invoiceFormEl = document.getElementById('invoice-form');
  const invoicesListEl = document.getElementById('invoices-list');

  function buildInvoiceForm() {
    invoiceFormEl.innerHTML = '';
    function field(key, label, type) {
      const div = document.createElement('div');
      div.className = 'field-group';
      const id = 'inv_' + key;
      div.innerHTML = `
        <label for="${id}">${label}</label>
        <input id="${id}" data-key="${key}" type="${type || 'text'}">
      `;
      invoiceFormEl.appendChild(div);
    }
    field('clientName', 'Client name');
    field('project', 'Project name');
    field('amount', 'Amount', 'number');
    field('currency', 'Currency (e.g. INR, USD)');
    field('notes', 'Notes (optional)');
  }

  buildInvoiceForm();

  function loadInvoices() {
    api('/api/invoices')
      .then(invs => {
        invoicesListEl.innerHTML = '';
        (invs || []).slice().reverse().forEach(inv => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.innerHTML = `
            <div class="list-item-main">
              <div style="font-weight:600;">${inv.clientName || ''} – ${inv.project || ''}
                <span class="badge" style="color:${inv.status === 'paid' ? '#22c55e' : '#f97316'};border-color:${inv.status === 'paid' ? '#22c55e' : '#f97316'};">${inv.status || 'unpaid'}</span>
              </div>
              <div style="font-size:0.85rem;color:#ccc;margin-top:0.25rem;">${inv.amount || 0} ${inv.currency || ''}</div>
              ${inv.notes ? `<div style=\\"font-size:0.8rem;color:#aaa;margin-top:0.3rem;\\">${inv.notes}</div>` : ''}
            </div>
            <div class="list-item-actions">
              <button style="padding:0.3rem 0.6rem;border-radius:6px;border:none;background:#22c55e;color:#000;font-size:0.75rem;" data-action="paid">Mark paid</button>
              <button style="padding:0.3rem 0.6rem;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:0.75rem;" data-action="pdf">Download PDF</button>
              <button style="padding:0.3rem 0.6rem;border-radius:6px;border:none;background:#ef4444;color:#fff;font-size:0.75rem;" data-action="delete">Delete</button>
            </div>
          `;
          item.querySelectorAll('[data-action]').forEach(btn => {
            const action = btn.getAttribute('data-action');
            if (action === 'paid') {
              btn.addEventListener('click', () => {
                api('/api/invoices/' + inv.id, { method: 'PATCH', json: { status: 'paid' } })
                  .then(loadInvoices);
              });
            } else if (action === 'pdf') {
              btn.addEventListener('click', () => {
                downloadInvoicePdf(inv.id);
              });
            } else if (action === 'delete') {
              btn.addEventListener('click', () => {
                if (!confirm('Delete this invoice?')) return;
                api('/api/invoices/' + inv.id, { method: 'DELETE' })
                  .then(loadInvoices);
              });
            }
          });
          invoicesListEl.appendChild(item);
        });
      })
      .catch(() => {
        invoicesListEl.innerHTML = '<p style="color:#f87171;font-size:0.85rem;">Failed to load invoices.</p>';
      });
  }

  function downloadInvoicePdf(id) {
    fetch('/api/invoices/' + id + '/pdf', {
      headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = id + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(() => alert('Failed to download invoice PDF.'));
  }

  document.getElementById('create-invoice').addEventListener('click', () => {
    const data = {};
    invoiceFormEl.querySelectorAll('input').forEach(el => {
      const key = el.getAttribute('data-key');
      if (!key) return;
      data[key] = el.value;
    });
    if (!data.clientName || !data.project || !data.amount) {
      alert('Client, project, and amount are required.');
      return;
    }
    data.amount = Number(data.amount) || 0;
    api('/api/invoices', { method: 'POST', json: data })
      .then(() => {
        alert('Invoice created.');
        buildInvoiceForm();
        loadInvoices();
      })
      .catch(() => alert('Failed to create invoice.'));
  });
})();
