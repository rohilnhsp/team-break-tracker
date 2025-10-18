import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Europe/London");

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentPath = window.location.pathname; // get URL path

  useEffect(() => {
    const sessionPromise = supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && currentPath === "/admin") checkAdmin();
  }, [user]);

  async function checkAdmin() {
    const { data, error } = await supabase
      .from("team_members")
      .select("is_admin")
      .eq("auth_id", user.id)
      .single();
    if (!error && data?.is_admin) setIsAdmin(true);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
  }

  async function handlePunch(type) {
    const { error } = await supabase.from("punch_records").insert({
      user_id: user.id,
      type,
      timestamp: new Date().toISOString(),
    });
    if (error) alert("Error punching: " + error.message);
    else loadPunches();
  }

  async function loadPunches() {
    setLoading(true);
    const { data, error } = await supabase
      .from("punch_records")
      .select("*")
      .eq("user_id", user.id)
      .order("timestamp", { ascending: false });
    if (!error) setPunches(data);
    setLoading(false);
  }

  useEffect(() => {
    if (user) loadPunches();
  }, [user]);

  // -------------------------------
  // ADMIN LOGIN PAGE
  if (currentPath === "/admin" && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-80">
          <h2 className="text-2xl mb-4 text-center font-bold">Admin Login</h2>
          <input name="email" type="email" placeholder="Email" required className="border p-2 mb-3 w-full rounded" />
          <input name="password" type="password" placeholder="Password" required className="border p-2 mb-4 w-full rounded" />
          <button className="bg-blue-500 hover:bg-blue-600 text-white py-2 rounded w-full">Login</button>
        </form>
      </div>
    );
  }

  // -------------------------------
  // ADMIN DASHBOARD PAGE
  if (currentPath === "/admin" && user) {
    if (!isAdmin) return <p>You are not authorized to access this page.</p>;

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button onClick={handleLogout} className="bg-gray-800 text-white px-4 py-2 rounded">Logout</button>
        </div>
        <p>Admin features go here: Add/Remove users, export data, etc.</p>
      </div>
    );
  }

  // -------------------------------
  // USER DASHBOARD
  if (!user) {
    // auto-login users could be handled here if needed
    return <p>Please login via /admin (if admin) or use magic link if you implement it.</p>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Team Break Tracker</h1>
        <button onClick={handleLogout} className="bg-gray-800 text-white px-4 py-2 rounded">Logout</button>
      </div>

      <div className="flex gap-4 mb-6">
        <button onClick={() => handlePunch("punch_in")} className="bg-green-500 text-white px-4 py-2 rounded">Punch In</button>
        <button onClick={() => handlePunch("punch_out")} className="bg-red-500 text-white px-4 py-2 rounded">Punch Out</button>
        <button onClick={() => handlePunch("break_start")} className="bg-yellow-500 text-white px-4 py-2 rounded">Break Start</button>
        <button onClick={() => handlePunch("break_end")} className="bg-blue-500 text-white px-4 py-2 rounded">Break End</button>
      </div>

      {loading ? (
        <p>Loading punches...</p>
      ) : punches.length === 0 ? (
        <p>No punches yet.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2">Type</th>
              <th className="border p-2">Time (UK)</th>
            </tr>
          </thead>
          <tbody>
            {punches.map((p) => (
              <tr key={p.id}>
                <td className="border p-2">{p.type.replace("_", " ")}</td>
                <td className="border p-2">{dayjs(p.timestamp).tz("Europe/London").format("DD MMM YYYY, HH:mm")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
