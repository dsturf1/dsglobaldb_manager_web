
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

function App() {
  return (
<Authenticator hideSignUp={true}>
  {({ signOut, user }) => {

    return (
      <BaseProvider >
        <ComponentProvider>
          <DayRecordProvider >
            <DSAppBar signOut = {signOut} user = {user.username}/>
            <ExampleComponent />
          </DayRecordProvider>
        </ComponentProvider>
      </BaseProvider>
    );
  }}
</Authenticator>
  );
}

export default App;

