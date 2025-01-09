import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';

const pages = [
  { name: '방제일지등록', url: 'dsworkupdate' },
  { name: '방제일지보기', url: 'dswork' },
  { name: '방제자료설정', url: 'dssetting' },
];

function ResponsiveAppBar({ signOut, user }) {
  const [selectedIndex, setSelectedIndex] = useState(-1);


  return (
    <div className="navbar bg-base-100 shadow-lg">
      <div className="navbar-start">
        <Link to="/" className="btn btn-ghost normal-case text-xl">
          동성그린
        </Link>
      </div>
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          {pages.map((page, index) => (
            <li key={page.name}>
              <Link
                to={page.url}
                className={`tab tab-bordered ${selectedIndex === index ? 'tab-active' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                {page.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="navbar-end">
        <div className="dropdown dropdown-end">
          <label tabIndex={0} className="btn btn-ghost btn-circle avatar">
            <div className="w-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"></path>
              </svg>
            </div>
          </label>
          <ul
            tabIndex={0}
            className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-base-100 rounded-box w-52"
          >
            <li>
              <a onClick={() => signOut()} className="text-red-600">
                로그아웃
              </a>
            </li>
            <li className="menu-title">

            </li>
            <li>
              <span>{user}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ResponsiveAppBar;
