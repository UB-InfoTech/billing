import axios from "axios";

const configuredBaseURL = String(import.meta.env.VITE_API_URL || "").trim();
const fallbackBaseURL = import.meta.env.DEV ? "http://localhost:5000" : "";
const baseURL = (configuredBaseURL || fallbackBaseURL).replace(/\/+$/, "");

const instance = axios.create({ baseURL });

instance.interceptors.request.use(
  config => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      if (typeof config.headers.set === "function") {
        config.headers.set("x-auth-token", token);
      } else {
        config.headers["x-auth-token"] = token;
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

export default instance;
