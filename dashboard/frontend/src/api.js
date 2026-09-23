const BASE_URL = "http://localhost:8000";

async function get(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
  const url = `${BASE_URL}${path}${query.toString() ? `?${query}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json();
}

export const getMeta = () => get("/api/meta");

export const getRankings = (params) => get("/api/rankings", params);

export const getDistrict = (districtCode) => get(`/api/districts/${districtCode}`);

export const compareMethod = (params) => get("/api/compare", params);
