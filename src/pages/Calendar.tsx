import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Calendar = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to accommodation calendar by default
    navigate("/admin/calendar/accommodation", { replace: true });
  }, [navigate]);

  return null;
};

export default Calendar;
