import { defineConfig } from 'jsrepo';

export default defineConfig({
  registries: ['https://reactbits.dev/r'],
  paths: {
    component: 'src/components/react-bits/micro',
    '*': 'src/components/react-bits/micro',
		file: 'src/components/react-bits/micro'
  },
});
