import { Document } from "mongoose";
import Game from "../game-model";
import Word, { WordDocument } from "../word/word-model";
import { Settings, Team } from "../game-types";

// Default game settings object
const defaultGameSettings: Settings = {
  numberOfCards: 25,
  startingTeam: Team.Green,
  numberOfAssassins: 1,
};

/**
 * Generates an array of colors to be allocated randomly to the game words for any number of total cards
 * @param settings - Game settings.
 * @param otherTeam - The other team's color.
 * @returns Array of colors.
 */
const generateColorsToAllocate = (
  settings: Settings,
  otherTeam: string
): string[] => {
  const numberOfCardsNonTeam = Math.round((8 / 25) * settings.numberOfCards);
  const numberOfCardsStartingTeam = Math.ceil(
    (settings.numberOfCards - numberOfCardsNonTeam) / 2
  );
  const numberOfCardsOtherTeam = Math.floor(
    (settings.numberOfCards - numberOfCardsNonTeam) / 2
  );
  const numberOfCardsAssassins = settings.numberOfAssassins;
  const numberOfCardsBystander =
    settings.numberOfCards -
    numberOfCardsStartingTeam -
    numberOfCardsOtherTeam -
    numberOfCardsAssassins;

  return Array(numberOfCardsStartingTeam)
    .fill(settings.startingTeam)
    .concat(
      Array(numberOfCardsOtherTeam).fill(otherTeam),
      Array(numberOfCardsAssassins).fill("assassin"),
      Array(numberOfCardsBystander).fill("none")
    );
};

/**
 * Creates a new game with the specified or default settings.
 * @param gameSettings - Custom game settings.
 * @returns The newly created game.
 */
export async function createNewGame(
  gameSettings: Partial<Settings> = defaultGameSettings
): Promise<Document> {
  const settings: Settings = { ...defaultGameSettings, ...gameSettings };
  const otherTeam =
    settings.startingTeam === Team.Green ? Team.Red : Team.Green;
  const colorsToAllocate = generateColorsToAllocate(settings, otherTeam);

  try {
    const words = await getRandomWords(settings.numberOfCards);
    if (!words || words.length === 0) {
      throw new Error("No words found, please populate the database.");
    }

    const gameWords = words.map((word) => {
      const randomIndex = Math.floor(Math.random() * colorsToAllocate.length);
      const wordColor = colorsToAllocate.splice(randomIndex, 1)[0];
      return { word: word.word, team: wordColor };
    });

    const newGame = new Game({
      settings,
      state: { cards: gameWords },
    });

    await newGame.save();
    return newGame;
  } catch (error) {
    throw new Error(`Failed to create new game: ${error.message}`);
  }
}

const getRandomWords = (numberOfWords: number): Promise<WordDocument[]> => {
  return new Promise((resolve, reject) => {
    Word.findRandom({}, {}, { limit: numberOfWords }, (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results);
    });
  });
};