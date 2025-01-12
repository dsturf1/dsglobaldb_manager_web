import SidebarLeft from "./components/SideBar";
import SidebarRight from "./components/SidebarRight";
import DayRecordDetails from "./components/MainContent";

function DSOutMain() {
  return (
    <div className="flex h-screen min-w-0 bg-gray-100">
      
      {/* 왼쪽 사이드바 (2/12) */}
      <SidebarLeft className="w-1/12 bg-gray-100 border-r border-gray-300" />

      {/* 메인 콘텐츠 (7/12) */}
      <DayRecordDetails className="w-8/12 bg-white overflow-auto" />

      {/* 오른쪽 사이드바 (3/12) */}
      <SidebarRight className="w-3/12 bg-gray-100 border-l border-gray-300" />
    </div>
  );
}

export default DSOutMain;
