/**
 * CampusConnect — Client Application Controller
 * Handles Themes, Interactive Calculators, Scroll Reveal, and Counter Animations
 * Built with defensive null checks for robust cross-platform execution.
 */

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Theme Toggle Management
  const themeToggle = document.getElementById('theme-toggle');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }

  // 2. Navbar Glassmorphism on Scroll & Mobile Menu
  const navbar = document.getElementById('navbar');
  const mobileToggle = document.getElementById('mobile-toggle');
  const navLinks = document.getElementById('nav-links');

  window.addEventListener('scroll', () => {
    if (navbar) {
      if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
  });

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
    });
  }

  // 3. Attendance Calculator Interactivity
  const attendedInput = document.getElementById('attended-input');
  const totalInput = document.getElementById('total-input');
  const calcPercentage = document.getElementById('calc-percentage');
  const calcStatus = document.getElementById('calc-status');
  const progressCircle = document.getElementById('progress-circle');
  const circleText = document.getElementById('circle-text');

  function updateCalculator() {
    if (!attendedInput || !totalInput) return;

    const attended = parseInt(attendedInput.value) || 0;
    const total = parseInt(totalInput.value) || 1;

    if (attended > total) {
      attendedInput.value = total;
      return updateCalculator();
    }

    const percentage = Math.min(100, Math.max(0, ((attended / total) * 100))).toFixed(1);
    
    if (calcPercentage) calcPercentage.textContent = `${percentage}%`;
    if (circleText) circleText.textContent = `${Math.round(percentage)}%`;

    if (progressCircle) {
      progressCircle.style.background = `conic-gradient(var(--primary-indigo) ${percentage}%, var(--bg-tertiary) 0)`;
    }

    if (calcStatus) {
      if (percentage >= 75) {
        calcStatus.textContent = 'Safe';
        calcStatus.className = 'status-pill safe';
      } else {
        calcStatus.textContent = 'Critical Warning';
        calcStatus.className = 'status-pill warning';
      }
    }
  }

  if (attendedInput) attendedInput.addEventListener('input', updateCalculator);
  if (totalInput) totalInput.addEventListener('input', updateCalculator);

  // Initial calculation check on load
  updateCalculator();

  // 4. Scroll Reveal Animations (IntersectionObserver)
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          
          // Trigger counter animation if element contains metric counters
          const counters = entry.target.querySelectorAll('.metric-number');
          if (counters.length > 0) {
            counters.forEach(counter => animateCounter(counter));
          }
          
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback if IntersectionObserver is not supported or no reveal elements exist
    revealElements.forEach(el => el.classList.add('visible'));
  }

  // 5. Statistics Counter Animation
  function animateCounter(counterEl) {
    if (!counterEl) return;
    const target = parseInt(counterEl.getAttribute('data-target')) || 0;
    const duration = 2000;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        counterEl.textContent = target.toLocaleString();
        clearInterval(timer);
      } else {
        counterEl.textContent = Math.floor(current).toLocaleString();
      }
    }, stepTime);
  }

  // 6. FAQ Accordion Toggle
  const faqQuestions = document.querySelectorAll('.faq-question');

  faqQuestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      if (!item) return;

      const isActive = item.classList.contains('active');

      // Close all active items
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));

      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // 7. Newsletter Form Handling
  const form = document.getElementById('newsletter-form');
  const emailInput = document.getElementById('email-input');
  const feedback = document.getElementById('form-feedback');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (emailInput && emailInput.value.trim() !== '') {
        if (feedback) {
          feedback.textContent = 'Thank you! Access request submitted successfully.';
          feedback.className = 'form-feedback success';
        }
        emailInput.value = '';
      }
    });
  }

});
