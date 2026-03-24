const supabase = window.supabaseApp;
const page = document.body.dataset.page;
const statusElement = document.getElementById("authStatus");

function setStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `auth-status ${type}`.trim();
}

function getRedirectUrl() {
  return `${window.location.origin}/login.html?confirmed=1`;
}

function redirectToHome(delay = 0) {
  window.setTimeout(() => {
    window.location.href = "index.html";
  }, delay);
}

async function handleExistingSession() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && page === "login") {
    setStatus("Email verified and session active. Redirecting to the platform...", "success");
    redirectToHome(1400);
  }
}

function parseSkills(rawSkills) {
  return rawSkills
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");

  if (params.get("checkEmail") === "1") {
    setStatus(`Account created. Check ${email || "your email"} for the verification link, then log in here.`, "success");
    const resendEmailField = document.querySelector('#resendForm input[name="email"]');
    const loginEmailField = document.querySelector('#loginForm input[name="email"]');
    if (resendEmailField && email) {
      resendEmailField.value = email;
    }
    if (loginEmailField && email) {
      loginEmailField.value = email;
    }
  }

  if (params.get("confirmed") === "1") {
    setStatus("Your email was confirmed. You can log in now, or you may already be signed in automatically.", "success");
  }
}

function bindSignupPage() {
  const form = document.getElementById("signupForm");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Creating your account...", "");

    const formData = new FormData(form);
    const fullName = formData.get("full_name").toString().trim();
    const email = formData.get("email").toString().trim();
    const password = formData.get("password").toString();
    const role = formData.get("role").toString();
    const title = formData.get("title").toString().trim();
    const location = formData.get("location").toString().trim();
    const timezone = formData.get("timezone").toString().trim();
    const portfolioFocus = formData.get("portfolio_focus").toString().trim();
    const skills = parseSkills(formData.get("skills").toString());

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
        data: {
          full_name: fullName,
          role,
          title,
          location,
          timezone,
          portfolio_focus: portfolioFocus,
          skills,
        },
      },
    });

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setStatus("Account created. Redirecting you to login so you can verify your email.", "success");
    window.setTimeout(() => {
      window.location.href = `login.html?checkEmail=1&email=${encodeURIComponent(email)}`;
    }, 1000);
  });
}

function bindLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const resendForm = document.getElementById("resendForm");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Checking your credentials...", "");

    const formData = new FormData(loginForm);
    const email = formData.get("email").toString().trim();
    const password = formData.get("password").toString();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(error.message, "error");
      const resendEmailField = resendForm.querySelector('input[name="email"]');
      resendEmailField.value = email;
      return;
    }

    setStatus("Login successful. Redirecting to the platform...", "success");
    redirectToHome(900);
  });

  resendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Sending verification email again...", "");

    const formData = new FormData(resendForm);
    const email = formData.get("email").toString().trim();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getRedirectUrl(),
      },
    });

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setStatus("Verification email sent again. Check your inbox.", "success");
  });
}

readQueryMessage();
handleExistingSession();

if (page === "signup") {
  bindSignupPage();
}

if (page === "login") {
  bindLoginPage();
}
