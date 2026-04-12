import Layout from "../components/Layout/Layout";
import { useAuth } from "../context/AuthContext";
import "./Profile.css";

function Profile() {
  const { user } = useAuth();
  const showDepartment = user?.role === "staff";

  return (
    <Layout>
      <div className="profile-page">
        <h1 className="profile-title">Profile</h1>
        <p className="profile-sub">Your FixMyCampus account details.</p>
        <div className="profile-card">
          <div className="profile-avatar-lg" aria-hidden>
            {user?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <dl className="profile-dl">
            <div>
              <dt>Name</dt>
              <dd>{user?.name}</dd>
            </div>
            <div>
              <dt>University email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd className="profile-cap">{user?.role}</dd>
            </div>
            {showDepartment ? (
              <div>
                <dt>Department</dt>
                <dd>{user?.department?.name || "Not assigned"}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </Layout>
  );
}

export default Profile;
