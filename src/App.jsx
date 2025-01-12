
import React from 'react';
import { Authenticator, withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsExports from './aws-exports';
import './App.css'
import ExampleComponent from './components/TestBase';
import DSAppBar from './components/DSAppBar';
import { BaseProvider } from './context/BaseContext';
import { DayRecordProvider } from './context/DayRecordContext';
import {ComponentProvider} from './context/ComponentContext';
import Layout from './pages/Layout';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DSOutMain from './dsoutMain/DSOutMain';

function App() {
  return (
<Authenticator hideSignUp={true}>
  {({ signOut, user }) => {

    return (
      <BaseProvider >
        <ComponentProvider>
          <DayRecordProvider >
            <Layout>
              <Routes>
                <Route path="/" element={<DSOutMain/>} />
                {/* <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} /> */}
              </Routes>
            </Layout>
          </DayRecordProvider>
        </ComponentProvider>
      </BaseProvider>
    );
  }}
</Authenticator>
  );
}

export default App;

