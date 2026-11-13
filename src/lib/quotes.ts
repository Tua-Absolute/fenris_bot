// Built-in inspirational quotes (no Claude needed), plus each server's own additions.
import { JsonStore } from "./store.js";

export interface Quote { text: string; author: string }

export const BUILT_IN: Quote[] = [
  // Wolves and the pack
  { text: "For the strength of the Pack is the Wolf, and the strength of the Wolf is the Pack.", author: "Rudyard Kipling" },
  { text: "If you can meet with Triumph and Disaster and treat those two impostors just the same...", author: "Rudyard Kipling" },
  { text: "Cattle die, and kinsmen die, and so one dies one's self; but a noble name will never die, if good renown one gets.", author: "Hávamál" },
  { text: "The sluggard believes he shall live forever, if the fight he faces not; but age shall not grant him the gift of peace, though spears may spare his life.", author: "Hávamál" },
  { text: "If you want to go fast, go alone. If you want to go far, go together.", author: "African proverb" },
  // Stoics and the ancients
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "The best revenge is not to be like your enemy.", author: "Marcus Aurelius" },
  { text: "Very little is needed to make a happy life; it is all within yourself, in your way of thinking.", author: "Marcus Aurelius" },
  { text: "If it is not right, do not do it; if it is not true, do not say it.", author: "Marcus Aurelius" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "Dwell on the beauty of life. Watch the stars, and see yourself running with them.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "Difficulties strengthen the mind, as labor does the body.", author: "Seneca" },
  { text: "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.", author: "Seneca" },
  { text: "Begin at once to live, and count each separate day as a separate life.", author: "Seneca" },
  { text: "Men are disturbed not by things, but by the views which they take of them.", author: "Epictetus" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "Wealth consists not in having great possessions, but in having few wants.", author: "Epictetus" },
  { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "He who knows others is wise; he who knows himself is enlightened.", author: "Lao Tzu" },
  { text: "The beginning is the most important part of the work.", author: "Plato" },
  { text: "The unexamined life is not worth living.", author: "Socrates" },
  { text: "Fortune favors the bold.", author: "Virgil" },
  { text: "He who has begun is half done. Dare to be wise.", author: "Horace" },
  { text: "Be patient and tough; someday this pain will be useful to you.", author: "Ovid" },
  { text: "No act of kindness, no matter how small, is ever wasted.", author: "Aesop" },
  { text: "Slow and steady wins the race.", author: "Aesop" },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Proverb" },
  { text: "Smooth seas do not make skillful sailors.", author: "African proverb" },
  // Writers and thinkers
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Oliver Goldsmith" },
  { text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson" },
  { text: "Adopt the pace of nature: her secret is patience.", author: "Ralph Waldo Emerson" },
  { text: "Trust thyself: every heart vibrates to that iron string.", author: "Ralph Waldo Emerson" },
  { text: "Write it on your heart that every day is the best day in the year.", author: "Ralph Waldo Emerson" },
  { text: "If one advances confidently in the direction of his dreams, and endeavors to live the life which he has imagined, he will meet with a success unexpected in common hours.", author: "Henry David Thoreau" },
  { text: "Things do not change; we change.", author: "Henry David Thoreau" },
  { text: "Our doubts are traitors, and make us lose the good we oft might win, by fearing to attempt.", author: "William Shakespeare" },
  { text: "We know what we are, but know not what we may be.", author: "William Shakespeare" },
  { text: "This above all: to thine own self be true.", author: "William Shakespeare" },
  { text: "Be not afraid of greatness: some are born great, some achieve greatness, and some have greatness thrust upon 'em.", author: "William Shakespeare" },
  { text: "All we have to decide is what to do with the time that is given us.", author: "J.R.R. Tolkien" },
  { text: "Not all those who wander are lost.", author: "J.R.R. Tolkien" },
  { text: "Even the smallest person can change the course of the future.", author: "J.R.R. Tolkien" },
  { text: "When we are no longer able to change a situation, we are challenged to change ourselves.", author: "Viktor Frankl" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "Life can only be understood backwards; but it must be lived forwards.", author: "Søren Kierkegaard" },
  { text: "In the midst of winter, I found there was, within me, an invincible summer.", author: "Albert Camus" },
  { text: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", author: "Anne Frank" },
  { text: "I am not afraid of storms, for I am learning how to sail my ship.", author: "Louisa May Alcott" },
  { text: "Hold fast to dreams, for if dreams die, life is a broken-winged bird that cannot fly.", author: "Langston Hughes" },
  { text: "The best way out is always through.", author: "Robert Frost" },
  { text: "\"Hope\" is the thing with feathers that perches in the soul.", author: "Emily Dickinson" },
  { text: "Be kind, for everyone you meet is fighting a hard battle.", author: "Ian Maclaren" },
  { text: "Knowing is not enough; we must apply. Willing is not enough; we must do.", author: "Johann Wolfgang von Goethe" },
  { text: "You have brains in your head. You have feet in your shoes. You can steer yourself any direction you choose.", author: "Dr. Seuss" },
  { text: "There's no person in the whole world like you, and I like you just the way you are.", author: "Fred Rogers" },
  // Leaders, scientists, and athletes
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "Keep your eyes on the stars, and your feet on the ground.", author: "Theodore Roosevelt" },
  { text: "Far better is it to dare mighty things, to win glorious triumphs, even though checkered by failure, than to rank with those poor spirits who neither enjoy much nor suffer much.", author: "Theodore Roosevelt" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "Lost time is never found again.", author: "Benjamin Franklin" },
  { text: "Diligence is the mother of good luck.", author: "Benjamin Franklin" },
  { text: "Alone we can do so little; together we can do so much.", author: "Helen Keller" },
  { text: "Optimism is the faith that leads to achievement. Nothing can be done without hope and confidence.", author: "Helen Keller" },
  { text: "Life is either a daring adventure or nothing.", author: "Helen Keller" },
  { text: "You must do the thing you think you cannot do.", author: "Eleanor Roosevelt" },
  { text: "You may encounter many defeats, but you must not be defeated.", author: "Maya Angelou" },
  { text: "We delight in the beauty of the butterfly, but rarely admit the changes it has gone through to achieve that beauty.", author: "Maya Angelou" },
  { text: "If you can't fly then run, if you can't run then walk, if you can't walk then crawl, but whatever you do you have to keep moving forward.", author: "Martin Luther King Jr." },
  { text: "Darkness cannot drive out darkness; only light can do that. Hate cannot drive out hate; only love can do that.", author: "Martin Luther King Jr." },
  { text: "If there is no struggle, there is no progress.", author: "Frederick Douglass" },
  { text: "Success is to be measured not so much by the position that one has reached in life as by the obstacles which he has overcome while trying to succeed.", author: "Booker T. Washington" },
  { text: "You must never be fearful about what you are doing when it is right.", author: "Rosa Parks" },
  { text: "Life is like riding a bicycle. To keep your balance you must keep moving.", author: "Albert Einstein" },
  { text: "Imagination is more important than knowledge.", author: "Albert Einstein" },
  { text: "Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.", author: "Marie Curie" },
  { text: "If I have seen further it is by standing on the shoulders of giants.", author: "Isaac Newton" },
  { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "Thomas Edison" },
  { text: "The most effective way to do it, is to do it.", author: "Amelia Earhart" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "Don't let what you cannot do interfere with what you can do.", author: "John Wooden" },
  { text: "I hated every minute of training, but I said, \"Don't quit. Suffer now and live the rest of your life as a champion.\"", author: "Muhammad Ali" },
  { text: "Success is no accident. It is hard work, perseverance, learning, studying, sacrifice and most of all, love of what you are doing.", author: "Pelé" },
  { text: "We all have dreams. But in order to make dreams come into reality, it takes an awful lot of determination, dedication, self-discipline, and effort.", author: "Jesse Owens" },
  { text: "Just don't give up trying to do what you really want to do.", author: "Ella Fitzgerald" },
  { text: "Be water, my friend.", author: "Bruce Lee" },
];

interface GuildQuotes { custom: Quote[]; used: string[] }
const store = new JsonStore<Record<string, GuildQuotes>>("quotes", {});
const entry = (guildId: string) => (store.data[guildId] ??= { custom: [], used: [] });
const keyOf = (q: Quote) => `${q.text}|${q.author}`;

export function customQuotes(guildId: string): Quote[] {
  return entry(guildId).custom;
}

export function allQuotes(guildId: string, customOnly = false): Quote[] {
  const custom = entry(guildId).custom;
  return customOnly && custom.length ? custom : [...BUILT_IN, ...custom];
}

export async function addQuote(guildId: string, quote: Quote) {
  entry(guildId).custom.push(quote);
  await store.save();
}

export async function removeQuote(guildId: string, index: number): Promise<Quote | undefined> {
  const [removed] = entry(guildId).custom.splice(index, 1);
  if (removed) await store.save();
  return removed;
}

/** Picks a random quote this server hasn't seen yet; starts over once every quote has been used. */
export async function nextQuote(guildId: string, customOnly = false): Promise<Quote> {
  const e = entry(guildId);
  const pool = allQuotes(guildId, customOnly);
  let fresh = pool.filter((q) => !e.used.includes(keyOf(q)));
  if (!fresh.length) {
    const poolKeys = new Set(pool.map(keyOf));
    e.used = e.used.filter((k) => !poolKeys.has(k));
    fresh = pool;
  }
  const pick = fresh[Math.floor(Math.random() * fresh.length)];
  e.used.push(keyOf(pick));
  await store.save();
  return pick;
}
