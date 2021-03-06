import { render, screen } from '@carv/testing-library'
import Form from '../main.svelte'

test('renders the form', () => {
  render(Form)

  const submit = screen.getByRole('button', { name: /submit/i })

  expect(submit).toBeInTheDocument()
})
