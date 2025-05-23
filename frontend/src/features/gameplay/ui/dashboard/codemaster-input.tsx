import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import ActionButton from "../action-button/action-button";
import { useGameContext } from "@frontend/game/state";
import { Round, Card } from "@codenames/shared/src/types/game-types";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const InputContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  text-align: center;
  font-size: clamp(0.9rem, 2.5vw, 2.5rem);
  background-color: ${({ theme }) => theme.inputBackground};
  border-radius: 8px;
  padding: 1rem;

  @media (max-width: 600px) {
    flex-direction: column;
  }
`;

const InlineGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`;

const InlineText = styled.span`
  font-size: inherit;
  color: ${({ theme }) => theme.text};
`;

const UnderlinedTextInput = styled.input<{ isError: boolean }>`
  padding: 0.2rem;
  font-size: inherit;
  border: none;
  border-bottom: 2px solid
    ${({ isError, theme }) => (isError ? theme.error : theme.text)};
  background: transparent;
  outline: none;
  text-align: center;
  width: auto;
  min-width: 60px;
  color: ${({ theme }) => theme.text};

  &:focus {
    border-bottom: 2px solid
      ${({ isError, theme }) => (isError ? theme.error : theme.primary)};
  }
`;

const UnderlinedNumberInput = styled(UnderlinedTextInput)`
  min-width: 30px;
`;

const ErrorMessage = styled.div`
  color: white;
  font-size: clamp(1rem, 2vw, 1.5rem);
  width: 100%;
  text-align: center;
  margin-top: 1rem;
  margin-bottom: 1rem;
  order: 1;
  background-color: ${({ theme }) => theme.error};
`;

const ButtonWrapper = styled.div`
  order: 3;
  display: flex;
  justify-content: center;
  margin-top: 1rem;
  width: 100%;
`;

const StyledActionButton = styled(ActionButton)`
  font-size: clamp(1rem, 2vw, 1.5rem);
  background-color: ${({ theme }) => theme.primary};
  color: ${({ theme }) => theme.buttonText};
`;

type CodeWordInputProps = {
  codeWord?: string;
  numberOfCards?: number;
  isEditable?: boolean;
  onSubmit?: (updatedRounds: Round[]) => void;
};

const CodeWordInput: React.FC<CodeWordInputProps> = ({
  codeWord = "",
  numberOfCards = 0,
  isEditable = false,
  onSubmit,
}) => {
  const { gameData } = useGameContext();

  // local component state...
  const [displayedWord, setDisplayedWord] = useState(codeWord);
  const [displayedNumber, setDisplayedNumber] = useState(numberOfCards);
  const [displaySubmit, setDisplaySubmit] = useState(isEditable);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(isEditable);

  const textInputRef = useRef<HTMLInputElement>(null);

  const validationError = (errorMsg: string): void => {
    setDisplaySubmit(false);
    setError(errorMsg);
  };

  const validationSuccess = (): void => {
    setDisplaySubmit(canEdit);
    setError(null);
  };

  const updatedDisplayedWord = (updatedWord: string) => {
    if (updatedWord.length >= 30) {
      validationError("Maximum number of characters reached...");
    } else {
      setDisplayedWord(updatedWord);
    }
  };

  /* useEffect to focus the cursor on the input text field as the component becomes editable */

  useEffect(() => {
    if (isEditable && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [isEditable]);

  /* useEffect calls for input validation as the user types */

  useEffect(() => {
    if (textInputRef.current) {
      textInputRef.current.style.width = `
        ${Math.max(displayedWord.length, 10) + 2}ch`;
    }
  }, [displayedWord]);

  useEffect(() => {
    const wordsInGameData =
      gameData.state.cards.map((card: Card) => card.word.toLowerCase()) || [];
    const isSingleWord = !/\s/.test(displayedWord);
    const isUnique = !wordsInGameData.some((word: string) =>
      displayedWord.toLowerCase().includes(word),
    );

    if (!isSingleWord) {
      validationError("The codeword must be a single word.");
    } else if (!isUnique) {
      validationError(
        "The codeword cannot contain any part of an existing word in the game.",
      );
    } else {
      validationSuccess();
    }
  }, [displayedWord]);

  /* function called to submit the codeword and number of guesses to the parent onSubmit callback. */

  const handleClick = () => {
    if (!error) {
      setDisplaySubmit(false);
      setCanEdit(false);

      const updatedRounds = [...gameData.state.rounds];
      const lastRound = updatedRounds.at(-1);

      if (lastRound) {
        const updatedRound = {
          ...lastRound,
          codeword: displayedWord,
          guessesAllowed: displayedNumber,
        };

        updatedRounds[updatedRounds.length - 1] = updatedRound;
      }

      onSubmit(updatedRounds);
    }
  };

  return (
    <Container id="cm-input-outer-container">
      <InputContainer id="cm-input-inner-container">
        <InlineGroup className="cm-input-inline-group">
          <UnderlinedTextInput
            ref={textInputRef}
            type="text"
            value={displayedWord}
            onChange={(e) => updatedDisplayedWord(e.target.value)}
            placeholder="codeword"
            disabled={!canEdit}
            isError={!!error}
          />
          <InlineText>links</InlineText>
        </InlineGroup>

        <InlineGroup className="cm-input-inline-group">
          <UnderlinedNumberInput
            type="number"
            value={displayedNumber}
            onChange={(e) => setDisplayedNumber(parseInt(e.target.value))}
            min={1}
            max={9}
            placeholder="0"
            disabled={!canEdit}
            isError={!!error}
          />
          <InlineText>cards</InlineText>
        </InlineGroup>

        {error && <ErrorMessage>{error}</ErrorMessage>}
      </InputContainer>

      {displaySubmit && (
        <ButtonWrapper>
          <StyledActionButton
            text="Submit"
            onClick={handleClick}
            enabled={!error && displayedWord.length > 0 && displayedNumber > 0}
          />
        </ButtonWrapper>
      )}
    </Container>
  );
};

export default CodeWordInput;
