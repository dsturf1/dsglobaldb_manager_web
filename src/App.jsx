import React from 'react';
import { Authenticator, withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports';
import './App.css'
import { BaseProvider } from './context/BaseContext';
import { DayRecordProvider } from './context/DayRecordContext';
import {GlobalComponentProvider} from './context/ComponentContext';
import Layout from './pages/Layout';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DSDBMain from './dsdbMain/DSDBMain';

function App() {

  return (
    <Authenticator hideSignUp={true}>
      {({ signOut, user }) => {
        return (
          <BaseProvider >
            <GlobalComponentProvider>
              <DayRecordProvider >
                <Layout>
                  <Routes>
                    <Route path="/dsdb/*" element={<DSDBMain />} />
                    <Route path="/" element={<DSDBMain />} />

                    {/* <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} /> */}
                  </Routes>
                </Layout>
              </DayRecordProvider>
            </GlobalComponentProvider>
          </BaseProvider>
        );
      }}
    </Authenticator>
  );
}

export default App;

