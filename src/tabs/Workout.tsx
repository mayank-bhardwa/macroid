// Workout mode is intentionally kept separate from the diet/nutrition app.
// This is the landing surface for the workout space; the actual logging
// features (exercises, sets/reps/weight, volume & PRs, measurements, photos)
// are built out here without touching any diet-related code or data.
export function WorkoutTab() {
  return (
    <div className="card">
      <div className="empty">
        <div className="big">🏋️</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Workout</div>
        <div className="small" style={{ maxWidth: 300 }}>
          Your training space — kept completely separate from the diet side. Log exercises,
          sets, reps &amp; weight, and track volume, PRs, measurements and progress photos here.
        </div>
        <div className="tiny faint" style={{ marginTop: 12 }}>
          Coming soon. Switch back to <b>Diet</b> from the header switch anytime.
        </div>
      </div>
    </div>
  )
}
