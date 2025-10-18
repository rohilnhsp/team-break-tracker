import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const UK_TZ = "Europe/London";

export default function App() {
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [period, setPeriod] = useState("daily");

  // ---------- AUTH ----------
  useEffect(() => {
    const session = supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) setUser(data.session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Login failed: " + error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // ---------- DATA ----------
  const fetchTeamData = async () => {
    setLoading(true);
    const { data: members } = await supabase.from("team_members").select("*").order("created_at");
    setTeam(members || []);
    const { data: records } = await supabase.from("attendance").select("*").order("created_at");
    setAttendance(records || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchTeamData();
  }, [user]);

  // ---------- ADMIN ADD / REMOVE ----------
  const addMember = async () => {
    if (!newMemberEmail || !newMemberName) return alert("Enter name and email");
    const { error } = await supabase
      .from("team_members")
      .insert([{ email: newMemberEmail, full_name: newMemberName, role: "member" }]);
    if (error) alert(error.message);
    else {
      alert("Member added!");
      setNewMemberEmail("");
      setNewMemberName("");
      fetchTeamData();
    }
  };

  const removeMember = async (id) => {
    if (!window.confirm("Remove this member?")) return;
    await supabase.from("team_members").delete().eq("id", id);
    fetchTeamData();
  };

  // ---------- PUNCH IN / OUT ----------
  const togglePunch = async (member) => {
    const openRecord = attendance.find(
      (a) => a.member_id === member.id && !a.punch_out
    );

    if (openRecord) {
      // punch out
      await supabase
        .from("attendance")
        .update({ punch_out: dayjs().tz(UK_TZ).toISOString() })
        .eq("id", openRecord.id);
    } else {
      // punch in
      await supabase
        .from("attendance")
        .insert([
          { member_id: member.id, punch_in: dayjs().tz(UK_TZ).toISOString() },
        ]);
    }
    fetchTeamData();
  };

  // ---------- BREAK DURATION ----------
  const getBreakDuration = (record) => {
    if (!record.punch_in) return "";
    const punchIn = dayjs(record.punch_in).tz(UK_TZ);
    const punchOut = record.punch_out
      ? dayjs(record.punch_out).tz(UK_TZ)
      : dayjs().tz(UK_TZ);
    const diff = punchOut.diff(punchIn, "minute");
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hrs}h ${mins}m`;
  };

  // ---------- EXPORT ----------
  const exportData = async () => {
    const { data, error } = await supabase
      .from("attendance")
      .select(
        `
        id,
        punch_in,
        punch_out,
        member_id,
        team_members!inner(full_name, email)
      `
      );
    if (error || !data?.length) {
      alert("No data to export or error occurred.");
      return;
    }

    const csvRows = [
      ["Name", "Email", "Punch In (UK)", "Punch Out (UK)", "Duration"],
      ...data.map((r) => [
        r.team_members.full_name,
        r.team_members.email,
        dayjs(r.punch_in).tz(UK_TZ).format("DD/MM/YYYY HH:mm"),
        r.punch_out
          ? dayjs(r.punch_out).tz(UK_TZ).format("DD/MM/YYYY HH:mm")
          : "",
        getBreakDuration(r),
      ]),
    ];

    const csv = csvRows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${period}_${dayjs()
      .tz(UK_TZ)
      .format("YYYYMMDD_HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- RENDER ----------
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <form
          onSubmit={handleLogin}
          className="bg-white p-8 rounded-2xl shadow w-80"
        >
          <h2 className="text-xl font-bold mb-4 text-center">Admin Login</h2>
          <input
            type="email"
            name="email"
            placeholder="Email"
            className="border p-2 w-full mb-3 rounded"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            className="border p-2 w-full mb-4 rounded"
            required
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded w-full"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-gray-600">
        Loading...
      </div>
    );

  const currentUser = team.find((m) => m.email === user.email);
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Team Break Tracker</h1>
        <button
          onClick={handleLogout}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {isAdmin && (
        <div className="bg-white p-4 rounded-xl shadow mb-6">
          <h2 className="font-semibold mb-2">Add Team Member</h2>
          <div className="flex gap-2 mb-3">
            <input
              placeholder="Full name"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="border p-2 rounded flex-1"
            />
            <input
              placeholder="Email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              className="border p-2 rounded flex-1"
            />
            <button
              onClick={addMember}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow">
        <h2 className="font-semibold mb-4">Team Members</h2>
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Status</th>
              <th className="p-2">Duration</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => {
              const record = attendance.find(
                (a) => a.member_id === member.id && !a.punch_out
              );
              return (
                <tr key={member.id} className="border-t">
                  <td className="p-2">{member.full_name}</td>
                  <td className="p-2">{member.email}</td>
                  <td className="p-2">
                    {record ? (
                      <span className="text-green-600 font-medium">On Break</span>
                    ) : (
                      <span className="text-gray-500">Available</span>
                    )}
                  </td>
                  <td className="p-2">
                    {record ? getBreakDuration(record) : "-"}
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => togglePunch(member)}
                      className={`px-3 py-1 rounded ${
                        record
                          ? "bg-yellow-500 text-white hover:bg-yellow-600"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {record ? "Punch Out" : "Punch In"}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => removeMember(member.id)}
                        className="ml-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <h2 className="font-semibold mb-2">Export Attendance Data</h2>
        <div className="flex gap-2 items-center">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            onClick={exportData}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
