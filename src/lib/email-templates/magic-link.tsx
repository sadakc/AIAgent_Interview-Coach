import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import {
  brand,
  button,
  container,
  divider,
  footer,
  h1,
  main,
  text,
} from './_auth-styles'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your sign-in link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{siteName}</Text>
        <Heading style={h1}>Sign in to {siteName}</Heading>
        <Text style={text}>
          Tap the button below to sign in. This link expires shortly and can only be
          used once.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Sign in
        </Button>
        <Hr style={divider} />
        <Text style={footer}>
          Didn't request this? You can safely ignore this email — no changes were made.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
