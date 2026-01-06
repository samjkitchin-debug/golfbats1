import type { Trip } from "./tripActions";
import type { Course } from "./courseActions";

export function getTripCourseText(trip: Trip, courses: Course[]) {
  const course = trip.courseId
    ? courses.find((c) => c.id === trip.courseId)
    : undefined;

  const tee =
    course && trip.teeId ? course.tees.find((t) => t.id === trip.teeId) : undefined;

  const title =
    course && tee
      ? `${course.name} — ${tee.label}`
      : course
      ? course.name
      : trip.course
      ? trip.course
      : "Course TBD";

  const detail =
    course && tee ? `${tee.meters}m · Par ${tee.par} · Slope ${tee.slope}` : null;

  return { title, detail };
}

export function formatTripDateLong(dateStr: string): string {
  try {
    const date = new Date(dateStr + "T00:00:00");
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return dateStr;
  }
}
